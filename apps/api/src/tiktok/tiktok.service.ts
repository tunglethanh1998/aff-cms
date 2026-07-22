import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DraftJobStatus, TikTokAccount } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { TokenCryptoService } from '../common/crypto/token-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { TiktokApiClient } from './tiktok-api.client';

type SerializableAccount = Omit<
  TikTokAccount,
  | 'followerCount'
  | 'videoCount'
  | 'likesCount'
  | 'viewCount'
  | 'commentCount'
  | 'accessTokenEnc'
  | 'refreshTokenEnc'
> & {
  followerCount: string;
  videoCount: string;
  likesCount: string;
  viewCount: string;
  commentCount: string;
};

type OAuthSession = {
  createdAt: number;
  codeVerifier: string;
};

@Injectable()
export class TiktokService {
  private readonly oauthStates = new Map<string, OAuthSession>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiktokApi: TiktokApiClient,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly config: ConfigService,
  ) {}

  createOAuthStart() {
    const state = randomBytes(16).toString('hex');
    const codeVerifier = this.createCodeVerifier();
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('hex');

    this.oauthStates.set(state, {
      createdAt: Date.now(),
      codeVerifier,
    });
    this.pruneStates();

    return {
      url: this.tiktokApi.getAuthorizeUrl(state, codeChallenge),
      state,
    };
  }

  async handleOAuthCallback(code: string, state: string) {
    const session = this.oauthStates.get(state);
    if (!session) {
      throw new UnauthorizedException('Invalid OAuth state');
    }
    this.oauthStates.delete(state);

    const tokens = await this.tiktokApi.exchangeCode(code, session.codeVerifier);
    const account = await this.prisma.tikTokAccount.upsert({
      where: { openId: tokens.open_id },
      create: {
        openId: tokens.open_id,
        accessTokenEnc: this.tokenCrypto.encrypt(tokens.access_token),
        refreshTokenEnc: this.tokenCrypto.encrypt(tokens.refresh_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        accessTokenEnc: this.tokenCrypto.encrypt(tokens.access_token),
        refreshTokenEnc: this.tokenCrypto.encrypt(tokens.refresh_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    await this.syncAccount(account.id);
    const webAppUrl =
      this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';
    return `${webAppUrl}/accounts?connected=1&id=${account.id}`;
  }

  async listAccounts() {
    const accounts = await this.prisma.tikTokAccount.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return accounts.map((account) => this.toPublicAccount(account));
  }

  async getAccount(id: string) {
    const account = await this.prisma.tikTokAccount.findUnique({
      where: { id },
    });
    if (!account) {
      throw new NotFoundException('TikTok account not found');
    }
    return this.toPublicAccount(account);
  }

  async unlinkAccount(id: string) {
    await this.getAccount(id);
    await this.prisma.tikTokAccount.delete({ where: { id } });
    return { ok: true };
  }

  async syncAccount(id: string) {
    const account = await this.prisma.tikTokAccount.findUnique({
      where: { id },
    });
    if (!account) {
      throw new NotFoundException('TikTok account not found');
    }

    const accessToken = await this.getValidAccessToken(account);
    const user = await this.tiktokApi.getUserInfo(accessToken);
    const aggregates = await this.tiktokApi.listVideosAggregates(accessToken);

    const updated = await this.prisma.tikTokAccount.update({
      where: { id },
      data: {
        displayName: user.display_name ?? account.displayName,
        username: user.username ?? account.username,
        avatarUrl: user.avatar_url ?? account.avatarUrl,
        followerCount: BigInt(user.follower_count ?? 0),
        videoCount: BigInt(user.video_count ?? aggregates.listedVideoCount),
        likesCount: BigInt(user.likes_count ?? aggregates.likeCount),
        viewCount: BigInt(aggregates.viewCount),
        commentCount: BigInt(aggregates.commentCount),
        lastSyncedAt: new Date(),
      },
    });

    return this.toPublicAccount(updated);
  }

  async listDrafts(accountId: string) {
    await this.getAccount(accountId);
    return this.prisma.tikTokDraftJob.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadDraft(
    accountId: string,
    file: Express.Multer.File,
    caption?: string,
  ) {
    const account = await this.prisma.tikTokAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException('TikTok account not found');
    }

    const job = await this.prisma.tikTokDraftJob.create({
      data: {
        accountId,
        caption,
        localFileName: file.originalname,
        status: DraftJobStatus.PENDING,
      },
    });

    try {
      const accessToken = await this.getValidAccessToken(account);

      await this.prisma.tikTokDraftJob.update({
        where: { id: job.id },
        data: { status: DraftJobStatus.UPLOADING },
      });

      const init = await this.tiktokApi.initInboxUpload(
        accessToken,
        file.size,
      );

      await this.tiktokApi.uploadVideoFile(
        init.upload_url,
        file.buffer,
        file.mimetype,
      );

      return this.prisma.tikTokDraftJob.update({
        where: { id: job.id },
        data: {
          status: DraftJobStatus.SENT_TO_INBOX,
          tiktokPublishId: init.publish_id,
          errorMessage: null,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown upload error';
      return this.prisma.tikTokDraftJob.update({
        where: { id: job.id },
        data: {
          status: DraftJobStatus.FAILED,
          errorMessage: message,
        },
      });
    }
  }

  private async getValidAccessToken(account: TikTokAccount): Promise<string> {
    const expiresAt = account.tokenExpiresAt?.getTime() ?? 0;
    const needsRefresh = expiresAt - Date.now() < 60_000;

    if (!needsRefresh) {
      return this.tokenCrypto.decrypt(account.accessTokenEnc);
    }

    const refreshToken = this.tokenCrypto.decrypt(account.refreshTokenEnc);
    const tokens = await this.tiktokApi.refreshAccessToken(refreshToken);

    await this.prisma.tikTokAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEnc: this.tokenCrypto.encrypt(tokens.access_token),
        refreshTokenEnc: this.tokenCrypto.encrypt(tokens.refresh_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    return tokens.access_token;
  }

  private toPublicAccount(account: TikTokAccount): SerializableAccount {
    const {
      accessTokenEnc: _a,
      refreshTokenEnc: _r,
      ...rest
    } = account;

    return {
      ...rest,
      followerCount: account.followerCount.toString(),
      videoCount: account.videoCount.toString(),
      likesCount: account.likesCount.toString(),
      viewCount: account.viewCount.toString(),
      commentCount: account.commentCount.toString(),
    };
  }

  private createCodeVerifier(): string {
    // RFC 7636 unreserved charset, length 43–128. TikTok accepts this.
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const bytes = randomBytes(64);
    let verifier = '';
    for (const byte of bytes) {
      verifier += alphabet[byte % alphabet.length];
    }
    return verifier;
  }

  private pruneStates() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [state, session] of this.oauthStates.entries()) {
      if (session.createdAt < cutoff) {
        this.oauthStates.delete(state);
      }
    }
  }

  /** Deterministic helper for tests / debugging without exposing crypto internals */
  hashOpenId(openId: string) {
    return createHash('sha256').update(openId).digest('hex').slice(0, 12);
  }
}
