import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id: string;
  scope?: string;
  token_type?: string;
};

type TikTokApiEnvelope<T> = {
  data?: T;
  error?: {
    code: string;
    message: string;
    log_id?: string;
  };
};

type UserInfo = {
  open_id: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
  username?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
};

export type TikTokVideoItem = {
  id: string;
  title?: string;
  video_description?: string;
  cover_image_url?: string;
  share_url?: string;
  embed_link?: string;
  duration?: number;
  create_time?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
};

type InboxInitResponse = {
  publish_id: string;
  upload_url: string;
};

@Injectable()
export class TiktokApiClient {
  private readonly logger = new Logger(TiktokApiClient.name);
  private readonly clientKey: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(private readonly config: ConfigService) {
    this.clientKey = this.config.get<string>('TIKTOK_CLIENT_KEY') ?? '';
    this.clientSecret = this.config.get<string>('TIKTOK_CLIENT_SECRET') ?? '';
    this.redirectUri =
      this.config.get<string>('TIKTOK_REDIRECT_URI') ??
      'https://exposure-specials-father-differently.trycloudflare.com/tiktok/oauth/callback';
  }

  assertConfigured() {
    if (!this.clientKey || !this.clientSecret) {
      throw new ServiceUnavailableException(
        'TikTok API is not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.',
      );
    }
  }

  getAuthorizeUrl(state: string, codeChallenge: string): string {
    this.assertConfigured();
    const scopes = [
      'user.info.basic',
      'user.info.profile',
      'user.info.stats',
      'video.list',
      'video.upload',
    ].join(',');

    const params = new URLSearchParams({
      client_key: this.clientKey,
      response_type: 'code',
      scope: scopes,
      redirect_uri: this.redirectUri,
      state,
      // TikTok Login Kit (Desktop / many apps) requires PKCE.
      // code_challenge must be HEX(SHA256(code_verifier)), not base64url.
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
    this.assertConfigured();
    const body = new URLSearchParams({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
      code_verifier: codeVerifier,
    });

    return this.postForm<TokenResponse>(
      'https://open.tiktokapis.com/v2/oauth/token/',
      body,
    );
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    this.assertConfigured();
    const body = new URLSearchParams({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    return this.postForm<TokenResponse>(
      'https://open.tiktokapis.com/v2/oauth/token/',
      body,
    );
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    const fields = [
      'open_id',
      'union_id',
      'avatar_url',
      'display_name',
      'username',
      'follower_count',
      'following_count',
      'likes_count',
      'video_count',
    ].join(',');

    const url = `https://open.tiktokapis.com/v2/user/info/?fields=${fields}`;
    const envelope = await this.requestJson<TikTokApiEnvelope<{ user: UserInfo }>>(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!envelope.data?.user) {
      throw new BadGatewayException(
        envelope.error?.message ?? 'Failed to fetch TikTok user info',
      );
    }

    return envelope.data.user;
  }

  async listVideos(accessToken: string): Promise<{
    videos: TikTokVideoItem[];
    viewCount: number;
    commentCount: number;
    likeCount: number;
    listedVideoCount: number;
  }> {
    let cursor: number | undefined;
    let hasMore = true;
    let viewCount = 0;
    let commentCount = 0;
    let likeCount = 0;
    const videos: TikTokVideoItem[] = [];
    let pages = 0;
    const maxPages = 10;
    const fields = [
      'id',
      'title',
      'video_description',
      'cover_image_url',
      'share_url',
      'embed_link',
      'duration',
      'create_time',
      'view_count',
      'like_count',
      'comment_count',
      'share_count',
    ].join(',');

    while (hasMore && pages < maxPages) {
      const envelope = await this.requestJson<
        TikTokApiEnvelope<{
          videos?: TikTokVideoItem[];
          cursor?: number;
          has_more?: boolean;
        }>
      >(`https://open.tiktokapis.com/v2/video/list/?fields=${fields}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          max_count: 20,
          ...(cursor !== undefined ? { cursor } : {}),
        }),
      });

      const pageVideos = envelope.data?.videos ?? [];
      for (const video of pageVideos) {
        videos.push(video);
        viewCount += video.view_count ?? 0;
        commentCount += video.comment_count ?? 0;
        likeCount += video.like_count ?? 0;
      }

      hasMore = Boolean(envelope.data?.has_more);
      cursor = envelope.data?.cursor;
      pages += 1;

      if (envelope.error?.code && envelope.error.code !== 'ok') {
        this.logger.warn(
          `video.list error: ${envelope.error.code} ${envelope.error.message}`,
        );
        break;
      }
    }

    return {
      videos,
      viewCount,
      commentCount,
      likeCount,
      listedVideoCount: videos.length,
    };
  }

  async initInboxUpload(
    accessToken: string,
    videoSize: number,
  ): Promise<InboxInitResponse> {
    const envelope = await this.requestJson<
      TikTokApiEnvelope<InboxInitResponse>
    >('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1,
        },
      }),
    });

    if (!envelope.data?.publish_id || !envelope.data.upload_url) {
      throw new BadGatewayException(
        envelope.error?.message ?? 'Failed to init TikTok inbox upload',
      );
    }

    return envelope.data;
  }

  async uploadVideoFile(
    uploadUrl: string,
    file: Buffer,
    mimeType: string,
  ): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType || 'video/mp4',
        'Content-Length': String(file.byteLength),
        'Content-Range': `bytes 0-${file.byteLength - 1}/${file.byteLength}`,
      },
      body: new Uint8Array(file),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new BadGatewayException(
        `TikTok upload failed (${response.status}): ${text}`,
      );
    }
  }

  private async postForm<T>(url: string, body: URLSearchParams): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const json = (await response.json()) as T & {
      error?: string;
      error_description?: string;
      message?: string;
    };

    if (!response.ok) {
      throw new BadGatewayException(
        json.error_description ||
          json.error ||
          json.message ||
          'TikTok OAuth request failed',
      );
    }

    return json;
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit,
  ): Promise<T> {
    const response = await fetch(url, init);
    const json = (await response.json()) as T & {
      error?: { code?: string; message?: string };
    };

    if (!response.ok) {
      throw new BadGatewayException(
        json.error?.message || `TikTok API error (${response.status})`,
      );
    }

    return json;
  }
}
