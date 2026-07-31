/**
 * Cache-bust public assets with a build-time version query.
 * Set NEXT_PUBLIC_ASSET_VERSION at build (CI uses git sha).
 *
 * CloudFront /images/* must include query strings in the cache key
 * (Managed-CachingOptimized ignores query → ?v= will not bust CDN cache).
 */
export const ASSET_VERSION =
  process.env.NEXT_PUBLIC_ASSET_VERSION?.trim() || "dev";

export function assetUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const sep = normalized.includes("?") ? "&" : "?";
  return `${normalized}${sep}v=${encodeURIComponent(ASSET_VERSION)}`;
}
