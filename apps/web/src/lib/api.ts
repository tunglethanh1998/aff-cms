const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type AuthUser = {
  id: string;
  email: string;
  role: string;
};

export type TikTokAccount = {
  id: string;
  openId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: string;
  videoCount: string;
  likesCount: string;
  viewCount: string;
  commentCount: string;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DraftJob = {
  id: string;
  accountId: string;
  caption: string | null;
  localFileName: string;
  tiktokPublishId: string | null;
  status: "PENDING" | "UPLOADING" | "SENT_TO_INBOX" | "FAILED";
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TikTokVideo = {
  id: string;
  accountId: string;
  tiktokVideoId: string;
  title: string | null;
  description: string | null;
  coverUrl: string | null;
  shareUrl: string | null;
  embedLink: string | null;
  durationSec: number | null;
  viewCount: string;
  likeCount: string;
  commentCount: string;
  shareCount: string;
  publishedAt: string | null;
  syncedAt: string;
};

const TOKEN_KEY = "aff_cms_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) message = data.message.join(", ");
      else if (data.message) message = data.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function login(email: string, password: string) {
  return request<{ accessToken: string; user: AuthUser }>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
    false,
  );
}

export function me() {
  return request<AuthUser>("/auth/me");
}

export function listAccounts() {
  return request<TikTokAccount[]>("/tiktok/accounts");
}

export function getAccount(id: string) {
  return request<TikTokAccount>(`/tiktok/accounts/${id}`);
}

export function syncAccount(id: string) {
  return request<TikTokAccount>(`/tiktok/accounts/${id}/sync`, {
    method: "POST",
  });
}

export function unlinkAccount(id: string) {
  return request<{ ok: boolean }>(`/tiktok/accounts/${id}`, {
    method: "DELETE",
  });
}

export function startTikTokOAuth() {
  return request<{ url: string; state: string }>("/tiktok/oauth/start");
}

export function listDrafts(accountId: string) {
  return request<DraftJob[]>(`/tiktok/accounts/${accountId}/drafts`);
}

export type PaginatedVideos = {
  items: TikTokVideo[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  q: string | null;
};

export function listVideos(
  accountId: string,
  options: { page?: number; limit?: number; q?: string } = {},
) {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.q?.trim()) params.set("q", options.q.trim());
  const query = params.toString();

  return request<PaginatedVideos>(
    `/tiktok/accounts/${accountId}/videos${query ? `?${query}` : ""}`,
  );
}

export function uploadDraft(
  accountId: string,
  file: File,
  caption?: string,
) {
  const form = new FormData();
  form.append("video", file);
  if (caption) form.append("caption", caption);

  return request<DraftJob>(`/tiktok/accounts/${accountId}/drafts`, {
    method: "POST",
    body: form,
  });
}

export function formatCount(value: string | number | null | undefined) {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-US").format(Number.isFinite(num) ? num : 0);
}

export type AssetFolder = {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  childCount: number;
  assetCount: number;
  createdAt: string;
};

export type AssetFolderTreeNode = AssetFolder & {
  children: AssetFolderTreeNode[];
};

export type AssetItem = {
  id: string;
  folderId: string | null;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  width: number | null;
  height: number | null;
  s3Key: string;
  etag: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedAssets = {
  items: AssetItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  q: string | null;
};

export function listAssetFolders(parentId?: string | null) {
  const params = new URLSearchParams();
  if (parentId) params.set("parentId", parentId);
  const query = params.toString();
  return request<AssetFolder[]>(
    `/assets/folders${query ? `?${query}` : ""}`,
  );
}

export function getAssetFolderTree() {
  return request<AssetFolderTreeNode[]>("/assets/folders/tree");
}

export function createAssetFolder(name: string, parentId?: string | null) {
  return request<AssetFolder>("/assets/folders", {
    method: "POST",
    body: JSON.stringify({ name, parentId: parentId || undefined }),
  });
}

export function seedDefaultAssetFolders() {
  return request<AssetFolder[]>("/assets/folders/seed-defaults", {
    method: "POST",
  });
}

export function deleteAssetFolder(id: string) {
  return request<{ ok: boolean }>(`/assets/folders/${id}`, {
    method: "DELETE",
  });
}

export function bulkDeleteAssetFolders(ids: string[]) {
  return request<{
    deleted: string[];
    failed: { id: string; path?: string; reason: string }[];
    deletedCount: number;
    failedCount: number;
  }>("/assets/folders/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export function listAssets(options: {
  folderId?: string | null;
  page?: number;
  limit?: number;
  q?: string;
} = {}) {
  const params = new URLSearchParams();
  if (options.folderId) params.set("folderId", options.folderId);
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.q?.trim()) params.set("q", options.q.trim());
  const query = params.toString();
  return request<PaginatedAssets>(`/assets${query ? `?${query}` : ""}`);
}

export function deleteAsset(id: string) {
  return request<{ ok: boolean }>(`/assets/${id}`, { method: "DELETE" });
}

export function bulkDeleteAssets(ids: string[]) {
  return request<{
    deleted: string[];
    failed: { id: string; reason: string }[];
    deletedCount: number;
    failedCount: number;
  }>("/assets/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export async function uploadAssetImage(
  file: File,
  folderId?: string | null,
) {
  // Upload through API → S3 (same server-side path as Yosonavi),
  // avoiding browser CORS / presigned SignatureDoesNotMatch.
  const form = new FormData();
  form.append("file", file);
  if (folderId) form.append("folderId", folderId);

  return request<AssetItem>("/assets/upload", {
    method: "POST",
    body: form,
  });
}
