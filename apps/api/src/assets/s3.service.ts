import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

@Injectable()
export class S3Service {
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly publicBaseUrl: string | null;
  private readonly keyPrefix: string;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    // Support aff_cms names + Yosonavi CMS names
    this.bucket =
      this.config.get<string>('S3_BUCKET') ||
      this.config.get<string>('AWS_S3_BUCKET_NAME') ||
      '';
    this.publicBaseUrl =
      (
        this.config.get<string>('S3_PUBLIC_BASE_URL') ||
        this.config.get<string>('AWS_CLOUDFRONT_PREFIX') ||
        ''
      ).replace(/\/$/, '') || null;
    this.keyPrefix = (
      this.config.get<string>('S3_KEY_PREFIX') ?? 'assets'
    ).replace(/^\/+|\/+$/g, '');

    this.region =
      this.config.get<string>('AWS_REGION') ||
      this.config.get<string>('AWS_S3_BUCKET_REGION') ||
      'ap-southeast-1';
    const accessKeyId =
      this.config.get<string>('AWS_ACCESS_KEY_ID') ||
      this.config.get<string>('AWS_S3_ACCESS_KEY_ID') ||
      '';
    const secretAccessKey =
      this.config.get<string>('AWS_SECRET_ACCESS_KEY') ||
      this.config.get<string>('AWS_S3_SECRET_ACCESS_KEY') ||
      '';
    const endpoint =
      this.config.get<string>('S3_ENDPOINT') ||
      this.config.get<string>('AWS_S3_GATEWAY') ||
      undefined;

    if (this.bucket) {
      // Explicit keys for local/dev; otherwise use default chain (ECS task role).
      const credentials =
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined;
      this.client = new S3Client({
        region: this.region,
        ...(credentials ? { credentials } : {}),
        // Newer AWS SDK injects checksums into presigned PUTs; browser uploads
        // cannot satisfy them (SignatureDoesNotMatch).
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        ...(endpoint
          ? {
              endpoint,
              forcePathStyle:
                this.config.get<string>('S3_FORCE_PATH_STYLE') === 'true',
            }
          : {}),
      });
    } else {
      this.client = null;
    }
  }

  assertConfigured() {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException(
        'S3 is not configured. Set S3_BUCKET / AWS_S3_BUCKET_NAME (credentials via keys or IAM role).',
      );
    }
  }

  buildObjectKey(folderPath: string | null, filename: string) {
    const safeFolder = (folderPath || '')
      .replace(/^\/+|\/+$/g, '')
      .replace(/\\/g, '/');
    const parts = [this.keyPrefix, safeFolder, filename].filter(Boolean);
    return parts.join('/');
  }

  /** Server-side upload (same approach as Yosonavi uploadStream) — no browser CORS. */
  async putObject(params: {
    key: string;
    body: Buffer;
    mimeType: string;
  }) {
    this.assertConfigured();
    const result = await this.client!.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.mimeType,
      }),
    );
    return {
      etag: result.ETag?.replace(/"/g, '') || undefined,
    };
  }

  async createUploadUrl(params: {
    key: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    this.assertConfigured();
    // Match Yosonavi generatePresignedUrl: ContentType only, no ContentLength.
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.mimeType,
    });

    const uploadUrl = await getSignedUrl(this.client!, command, {
      expiresIn: 60 * 10,
    });

    return {
      uploadUrl,
      key: params.key,
      bucket: this.bucket,
      publicUrl: this.getPublicUrl(params.key),
      expiresIn: 600,
    };
  }

  async deleteObject(key: string) {
    this.assertConfigured();
    await this.client!.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  /** Fetch original object bytes (no transform / re-encode). */
  async getObject(key: string): Promise<{
    body: Buffer;
    contentType: string | undefined;
    contentLength: number | undefined;
  }> {
    this.assertConfigured();
    const result = await this.client!.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    const stream = result.Body;
    if (!stream) {
      throw new ServiceUnavailableException('Empty S3 object body');
    }
    const body = await this.streamToBuffer(stream as Readable);
    return {
      body,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
    };
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  getPublicUrl(key: string) {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
