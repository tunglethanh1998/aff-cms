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

export function deleteDraft(accountId: string, jobId: string) {
  return request<{ ok: boolean }>(
    `/tiktok/accounts/${accountId}/drafts/${jobId}`,
    { method: "DELETE" },
  );
}

export function bulkDeleteDrafts(accountId: string, ids?: string[]) {
  return request<{ ok: boolean; deletedCount: number }>(
    `/tiktok/accounts/${accountId}/drafts/bulk-delete`,
    {
      method: "POST",
      body: JSON.stringify(ids ? { ids } : {}),
    },
  );
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

export type FolderCompanionSummary = {
  id: string;
  originalName: string;
  url: string;
} | null;

export type AssetFolder = {
  id: string;
  accountId?: string | null;
  name: string;
  parentId: string | null;
  path: string;
  childCount: number;
  assetCount: number;
  portraitAssetId?: string | null;
  backgroundAssetId?: string | null;
  portrait?: FolderCompanionSummary;
  background?: FolderCompanionSummary;
  createdAt: string;
};

export type AssetFolderTreeNode = AssetFolder & {
  children: AssetFolderTreeNode[];
};

export type AssetItem = {
  id: string;
  accountId?: string | null;
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

async function downloadBinary(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Download failed (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) message = data.message.join(", ");
      else if (data.message) message = data.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const utf8Name = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plainName = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  const filename = decodeURIComponent(
    utf8Name || plainName || "download",
  );

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function downloadAsset(id: string) {
  return downloadBinary(`/assets/${id}/download`);
}

export function downloadAssetsZip(ids: string[]) {
  return downloadBinary("/assets/download-zip", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
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

function accountAssetsBase(accountId: string) {
  return `/tiktok/accounts/${accountId}/assets`;
}

export function getAccountAssetFolderTree(accountId: string) {
  return request<AssetFolderTreeNode[]>(
    `${accountAssetsBase(accountId)}/folders/tree`,
  );
}

export function createAccountAssetFolder(
  accountId: string,
  name: string,
  parentId?: string | null,
) {
  return request<AssetFolder>(`${accountAssetsBase(accountId)}/folders`, {
    method: "POST",
    body: JSON.stringify({ name, parentId: parentId || undefined }),
  });
}

export function bulkDeleteAccountAssetFolders(
  accountId: string,
  ids: string[],
) {
  return request<{
    deleted: string[];
    failed: { id: string; path?: string; reason: string }[];
    deletedCount: number;
    failedCount: number;
  }>(`${accountAssetsBase(accountId)}/folders/bulk-delete`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export function deleteAccountAssetFolder(
  accountId: string,
  folderId: string,
) {
  return request<{ ok: boolean }>(
    `${accountAssetsBase(accountId)}/folders/${folderId}`,
    { method: "DELETE" },
  );
}

export function updateAccountFolderCompanions(
  accountId: string,
  folderId: string,
  body: {
    portraitAssetId?: string | null;
    backgroundAssetId?: string | null;
  },
) {
  return request<AssetFolder>(
    `${accountAssetsBase(accountId)}/folders/${folderId}/companions`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export function listAccountAssets(
  accountId: string,
  options: {
    folderId?: string | null;
    page?: number;
    limit?: number;
    q?: string;
  } = {},
) {
  const params = new URLSearchParams();
  if (options.folderId) params.set("folderId", options.folderId);
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.q?.trim()) params.set("q", options.q.trim());
  const query = params.toString();
  return request<PaginatedAssets>(
    `${accountAssetsBase(accountId)}${query ? `?${query}` : ""}`,
  );
}

export function deleteAccountAsset(accountId: string, assetId: string) {
  return request<{ ok: boolean }>(
    `${accountAssetsBase(accountId)}/${assetId}`,
    { method: "DELETE" },
  );
}

export function downloadAccountAsset(accountId: string, assetId: string) {
  return downloadBinary(`${accountAssetsBase(accountId)}/${assetId}/download`);
}

export function downloadAccountAssetsZip(accountId: string, ids: string[]) {
  return downloadBinary(`${accountAssetsBase(accountId)}/download-zip`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export function bulkDeleteAccountAssets(accountId: string, ids: string[]) {
  return request<{
    deleted: string[];
    failed: { id: string; reason: string }[];
    deletedCount: number;
    failedCount: number;
  }>(`${accountAssetsBase(accountId)}/bulk-delete`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export async function uploadAccountAssetImage(
  accountId: string,
  file: File,
  folderId?: string | null,
) {
  const form = new FormData();
  form.append("file", file);
  if (folderId) form.append("folderId", folderId);

  return request<AssetItem>(`${accountAssetsBase(accountId)}/upload`, {
    method: "POST",
    body: form,
  });
}

export type DailyProductStatus = "PENDING" | "SYNCING" | "READY" | "FAILED";

export type DailyProductItem = {
  id: string;
  accountId: string;
  date: string;
  slot: number;
  folderName: string;
  productUrl: string;
  title: string | null;
  folderId: string;
  folderPath: string;
  status: DailyProductStatus;
  errorMessage: string | null;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
  assets: AssetItem[];
};

export type DailyProductsResponse = {
  accountId: string;
  date: string;
  items: DailyProductItem[];
};

function accountDailyProductsBase(accountId: string) {
  return `/tiktok/accounts/${accountId}/daily-products`;
}

export function listDailyProducts(accountId: string, date: string) {
  const params = new URLSearchParams({ date });
  return request<DailyProductsResponse>(
    `${accountDailyProductsBase(accountId)}?${params}`,
  );
}

export function createDailyProduct(
  accountId: string,
  date: string,
  productUrl: string,
) {
  return request<DailyProductItem>(accountDailyProductsBase(accountId), {
    method: "POST",
    body: JSON.stringify({ date, productUrl }),
  });
}

export function resyncDailyProduct(accountId: string, id: string) {
  return request<DailyProductItem>(
    `${accountDailyProductsBase(accountId)}/${id}/resync`,
    { method: "POST" },
  );
}

export function deleteDailyProduct(accountId: string, id: string) {
  return request<{ ok: boolean }>(
    `${accountDailyProductsBase(accountId)}/${id}`,
    { method: "DELETE" },
  );
}

export type AccountMediaKind = "portraits" | "backgrounds";

export type AccountMediaResponse = {
  kind: AccountMediaKind;
  folderId: string;
  folderPath: string;
  items: AssetItem[];
};

function accountMediaBase(accountId: string, kind: AccountMediaKind) {
  return `/tiktok/accounts/${accountId}/${kind}`;
}

export function listAccountMedia(accountId: string, kind: AccountMediaKind) {
  return request<AccountMediaResponse>(accountMediaBase(accountId, kind));
}

export async function uploadAccountMedia(
  accountId: string,
  kind: AccountMediaKind,
  file: File,
) {
  const form = new FormData();
  form.append("file", file);
  return request<AssetItem>(`${accountMediaBase(accountId, kind)}/upload`, {
    method: "POST",
    body: form,
  });
}

export function deleteAccountMedia(
  accountId: string,
  kind: AccountMediaKind,
  assetId: string,
) {
  return request<AccountMediaResponse>(
    `${accountMediaBase(accountId, kind)}/${assetId}`,
    { method: "DELETE" },
  );
}

export function bulkDeleteAccountMedia(
  accountId: string,
  kind: AccountMediaKind,
  ids: string[],
) {
  return request<
    AccountMediaResponse & { deletedCount: number; failedCount: number }
  >(`${accountMediaBase(accountId, kind)}/bulk-delete`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export type ProductPrompt = {
  id: string;
  name: string;
  category: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductPromptCategory = {
  name: string;
  count: number;
};

export type ProductPromptsResponse = {
  items: ProductPrompt[];
  total: number;
  categories: ProductPromptCategory[];
};

export function listProductPrompts(
  options: { category?: string; q?: string } = {},
) {
  const params = new URLSearchParams();
  if (options.category?.trim()) {
    params.set("category", options.category.trim());
  }
  if (options.q?.trim()) params.set("q", options.q.trim());
  const query = params.toString();
  return request<ProductPromptsResponse>(
    `/product-prompts${query ? `?${query}` : ""}`,
  );
}

export function createProductPrompt(input: {
  name: string;
  category: string;
  content: string;
}) {
  return request<ProductPrompt>("/product-prompts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProductPrompt(
  id: string,
  input: { name: string; category: string; content: string },
) {
  return request<ProductPrompt>(`/product-prompts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteProductPrompt(id: string) {
  return request<{ ok: boolean }>(`/product-prompts/${id}`, {
    method: "DELETE",
  });
}
