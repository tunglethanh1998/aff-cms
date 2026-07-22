import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DraftJobStatus, TikTokAccount, TikTokVideo } from '@prisma/client';
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
    const videoList = await this.tiktokApi.listVideos(accessToken);
    const syncedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.tikTokAccount.update({
        where: { id },
        data: {
          displayName: user.display_name ?? account.displayName,
          username: user.username ?? account.username,
          avatarUrl: user.avatar_url ?? account.avatarUrl,
          followerCount: BigInt(user.follower_count ?? 0),
          videoCount: BigInt(user.video_count ?? videoList.listedVideoCount),
          likesCount: BigInt(user.likes_count ?? videoList.likeCount),
          viewCount: BigInt(videoList.viewCount),
          commentCount: BigInt(videoList.commentCount),
          lastSyncedAt: syncedAt,
        },
      });

      const seenIds = videoList.videos.map((video) => video.id);

      for (const video of videoList.videos) {
        await tx.tikTokVideo.upsert({
          where: {
            accountId_tiktokVideoId: {
              accountId: id,
              tiktokVideoId: video.id,
            },
          },
          create: {
            accountId: id,
            tiktokVideoId: video.id,
            title: video.title ?? null,
            description: video.video_description ?? null,
            coverUrl: video.cover_image_url ?? null,
            shareUrl: video.share_url ?? null,
            embedLink: video.embed_link ?? null,
            durationSec: video.duration ?? null,
            viewCount: BigInt(video.view_count ?? 0),
            likeCount: BigInt(video.like_count ?? 0),
            commentCount: BigInt(video.comment_count ?? 0),
            shareCount: BigInt(video.share_count ?? 0),
            publishedAt: video.create_time
              ? new Date(video.create_time * 1000)
              : null,
            syncedAt,
          },
          update: {
            title: video.title ?? null,
            description: video.video_description ?? null,
            coverUrl: video.cover_image_url ?? null,
            shareUrl: video.share_url ?? null,
            embedLink: video.embed_link ?? null,
            durationSec: video.duration ?? null,
            viewCount: BigInt(video.view_count ?? 0),
            likeCount: BigInt(video.like_count ?? 0),
            commentCount: BigInt(video.comment_count ?? 0),
            shareCount: BigInt(video.share_count ?? 0),
            publishedAt: video.create_time
              ? new Date(video.create_time * 1000)
              : null,
            syncedAt,
          },
        });
      }

      if (seenIds.length > 0) {
        await tx.tikTokVideo.deleteMany({
          where: {
            accountId: id,
            tiktokVideoId: { notIn: seenIds },
          },
        });
      } else {
        await tx.tikTokVideo.deleteMany({ where: { accountId: id } });
      }
    });

    return this.getAccount(id);
  }

  async listVideos(
    accountId: string,
    options: {
      page?: number;
      limit?: number;
      q?: string;
    } = {},
  ) {
    await this.getAccount(accountId);

    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(50, Math.max(1, options.limit ?? 10));
    const q = options.q?.trim();

    const where = {
      accountId,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { description: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, videos] = await this.prisma.$transaction([
      this.prisma.tikTokVideo.count({ where }),
      this.prisma.tikTokVideo.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items: videos.map((video) => this.toPublicVideo(video)),
      page,
      limit,
      total,
      totalPages,
      q: q || null,
    };
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

  private toPublicVideo(video: TikTokVideo) {
    return {
      id: video.id,
      accountId: video.accountId,
      tiktokVideoId: video.tiktokVideoId,
      title: video.title,
      description: video.description,
      coverUrl: video.coverUrl,
      shareUrl: video.shareUrl,
      embedLink: video.embedLink,
      durationSec: video.durationSec,
      viewCount: video.viewCount.toString(),
      likeCount: video.likeCount.toString(),
      commentCount: video.commentCount.toString(),
      shareCount: video.shareCount.toString(),
      publishedAt: video.publishedAt,
      syncedAt: video.syncedAt,
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
