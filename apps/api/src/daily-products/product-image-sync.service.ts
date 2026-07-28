import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { AssetsService } from '../assets/assets.service';

const MAX_IMAGES = 10;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type ProductImageSyncResult = {
  title: string | null;
  imageCount: number;
  uploadedUrls: string[];
};

@Injectable()
export class ProductImageSyncService {
  private readonly logger = new Logger(ProductImageSyncService.name);

  constructor(private readonly assetsService: AssetsService) {}

  async syncFromProductUrl(
    productUrl: string,
    folderId: string,
    accountId: string,
  ): Promise<ProductImageSyncResult> {
    const pageUrl = this.assertHttpUrl(productUrl);
    const { html, finalUrl } = await this.fetchHtml(pageUrl);

    // TikTok share links often embed title/image in redirect query `og_info`
    // even when the HTML is a bot "Security Check" page.
    const shareMeta = this.extractShareOgInfo(pageUrl.toString(), finalUrl);

    const title =
      shareMeta.title || this.extractTitle(html) || null;
    const imageUrls = Array.from(
      new Set([
        ...shareMeta.imageUrls,
        ...this.extractImageUrls(html, finalUrl),
      ]),
    ).slice(0, MAX_IMAGES);

    if (imageUrls.length === 0) {
      const blocked = /security check/i.test(html);
      throw new BadRequestException(
        blocked
          ? 'TikTok blocked the page scrape (Security Check). Prefer share links that include og_info, or upload images manually into the folder.'
          : 'No product images found on the page (OG/meta may be blocked). You can upload images manually into the folder.',
      );
    }

    const uploadedUrls: string[] = [];
    const seenHashes = new Set<string>();

    for (const imageUrl of imageUrls) {
      try {
        const downloaded = await this.downloadImage(imageUrl);
        const hash = createHash('sha1').update(downloaded.buffer).digest('hex');
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        const asset = await this.assetsService.uploadImageBuffer({
          buffer: downloaded.buffer,
          mimeType: downloaded.mimeType,
          filename: downloaded.filename,
          folderId,
          accountId,
        });
        uploadedUrls.push(asset.url);
      } catch (err) {
        this.logger.warn(
          `Skip image ${imageUrl}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (uploadedUrls.length === 0) {
      throw new BadRequestException(
        'Found image URLs but failed to download/upload any. You can upload images manually into the folder.',
      );
    }

    return {
      title,
      imageCount: uploadedUrls.length,
      uploadedUrls,
    };
  }

  private assertHttpUrl(raw: string): URL {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new BadRequestException('Invalid product URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException('Only http/https product URLs are allowed');
    }
    return url;
  }

  private async fetchHtml(
    url: URL,
  ): Promise<{ html: string; finalUrl: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!response.ok) {
        throw new BadRequestException(
          `Failed to fetch product page (${response.status})`,
        );
      }
      const contentType = response.headers.get('content-type') || '';
      if (
        contentType &&
        !contentType.includes('text/html') &&
        !contentType.includes('application/xhtml')
      ) {
        throw new BadRequestException(
          `Product URL did not return HTML (${contentType})`,
        );
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_HTML_BYTES) {
        throw new BadRequestException('Product page HTML is too large');
      }
      return {
        html: buffer.toString('utf8'),
        finalUrl: response.url || url.toString(),
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        `Could not fetch product page: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private extractTitle(html: string): string | null {
    const ogTitle = this.matchMetaContent(html, 'og:title');
    if (ogTitle) return this.decodeHtml(ogTitle).slice(0, 300);

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch?.[1]) {
      const title = this.decodeHtml(titleMatch[1].replace(/\s+/g, ' ').trim());
      if (/security check/i.test(title)) return null;
      return title.slice(0, 300);
    }
    return null;
  }

  /**
   * TikTok product share redirects append `og_info={"title":"...","image":"..."}`.
   * This works even when HTML is replaced by a Security Check interstitial.
   */
  private extractShareOgInfo(
    ...urls: string[]
  ): { title: string | null; imageUrls: string[] } {
    let title: string | null = null;
    const imageUrls: string[] = [];

    for (const raw of urls) {
      if (!raw) continue;
      try {
        const url = new URL(raw);
        const ogInfoRaw = url.searchParams.get('og_info');
        if (!ogInfoRaw) continue;

        const parsed = JSON.parse(ogInfoRaw) as {
          title?: unknown;
          image?: unknown;
        };
        if (!title && typeof parsed.title === 'string' && parsed.title.trim()) {
          title = parsed.title.trim().slice(0, 300);
        }
        if (typeof parsed.image === 'string' && parsed.image.trim()) {
          const image = parsed.image.trim().replace(/\\\//g, '/');
          const absolute = this.toAbsoluteUrl(image, url.toString());
          if (absolute && !this.looksLikeTinyOrIcon(absolute)) {
            imageUrls.push(absolute);
          }
        }
      } catch (err) {
        this.logger.warn(
          `Failed to parse og_info from share URL: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { title, imageUrls: Array.from(new Set(imageUrls)) };
  }

  private extractImageUrls(html: string, baseUrl: string): string[] {
    const found: string[] = [];
    const push = (raw: string | null | undefined) => {
      if (!raw) return;
      const absolute = this.toAbsoluteUrl(raw.trim(), baseUrl);
      if (!absolute) return;
      if (this.looksLikeTinyOrIcon(absolute)) return;
      found.push(absolute);
    };

    push(this.matchMetaContent(html, 'og:image'));
    push(this.matchMetaContent(html, 'og:image:secure_url'));
    push(this.matchMetaContent(html, 'twitter:image'));
    push(this.matchMetaContent(html, 'twitter:image:src'));

    const imgRegex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(html)) !== null) {
      push(match[1]);
    }

    const dataSrcRegex = /<img\b[^>]*\bdata-src=["']([^"']+)["'][^>]*>/gi;
    while ((match = dataSrcRegex.exec(html)) !== null) {
      push(match[1]);
    }

    return Array.from(new Set(found));
  }

  private matchMetaContent(html: string, property: string): string | null {
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
        'i',
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
        'i',
      ),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  private toAbsoluteUrl(raw: string, baseUrl: string): string | null {
    try {
      if (raw.startsWith('data:')) return null;
      const url = new URL(raw, baseUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  private looksLikeTinyOrIcon(url: string): boolean {
    const lower = url.toLowerCase();
    return (
      lower.includes('favicon') ||
      lower.includes('logo') ||
      lower.includes('sprite') ||
      lower.includes('1x1') ||
      lower.includes('pixel') ||
      lower.endsWith('.svg')
    );
  }

  private async downloadImage(imageUrl: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(imageUrl, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      let mimeType = (
        response.headers.get('content-type') || ''
      )
        .split(';')[0]
        .trim()
        .toLowerCase();

      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) throw new Error('Empty image');
      if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Image too large');

      if (!IMAGE_MIME.has(mimeType)) {
        mimeType = this.sniffImageMime(buffer) || mimeType;
      }
      if (!IMAGE_MIME.has(mimeType)) {
        throw new Error(`Unsupported image type: ${mimeType || 'unknown'}`);
      }

      const ext = this.extForMime(mimeType);
      const hash = createHash('sha1').update(imageUrl).digest('hex').slice(0, 10);
      return {
        buffer,
        mimeType,
        filename: `product-${hash}.${ext}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private sniffImageMime(buffer: Buffer): string | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      return 'image/jpeg';
    }
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return 'image/png';
    }
    if (
      buffer.length >= 6 &&
      buffer.toString('ascii', 0, 6) === 'GIF87a'
    ) {
      return 'image/gif';
    }
    if (
      buffer.length >= 6 &&
      buffer.toString('ascii', 0, 6) === 'GIF89a'
    ) {
      return 'image/gif';
    }
    if (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }
    return null;
  }

  private extForMime(mimeType: string): string {
    switch (mimeType) {
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'image/gif':
        return 'gif';
      default:
        return 'jpg';
    }
  }

  private decodeHtml(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
}
