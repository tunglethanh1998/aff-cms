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
