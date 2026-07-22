"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CmsShell } from "@/components/cms-shell";
import { RequireAuth } from "@/components/require-auth";
import {
  formatCount,
  listAccounts,
  startTikTokOAuth,
  syncAccount,
  TikTokAccount,
  unlinkAccount,
} from "@/lib/api";

function AccountsContent() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const connected = searchParams.get("connected") === "1";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await listAccounts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onConnect() {
    setError(null);
    try {
      const { url } = await startTikTokOAuth();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start OAuth");
    }
  }

  async function onSync(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const updated = await syncAccount(id);
      setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onUnlink(id: string) {
    if (!confirm("Unlink this TikTok account?")) return;
    setBusyId(id);
    setError(null);
    try {
      await unlinkAccount(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlink failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <CmsShell title="TikTok accounts">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-zinc-600">
          Connect accounts via TikTok OAuth. Metrics (followers, avatar, videos,
          likes, views, comments) sync from TikTok Display API.
        </p>
        <button
          type="button"
          onClick={onConnect}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Connect TikTok
        </button>
      </div>

      {connected ? (
        <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          TikTok account connected and synced.
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No TikTok accounts yet. Click Connect TikTok to authorize an account.
        </p>
      ) : (
        <ul className="space-y-4">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex flex-col gap-4 border border-zinc-200 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-4">
                {account.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={account.avatarUrl}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-200 text-sm text-zinc-500">
                    TT
                  </div>
                )}
                <div className="space-y-1">
                  <Link
                    href={`/accounts/${account.id}`}
                    className="text-lg font-medium hover:underline"
                  >
                    {account.displayName || account.username || account.openId}
                  </Link>
                  <p className="text-sm text-zinc-500">
                    @{account.username || "unknown"} · synced{" "}
                    {account.lastSyncedAt
                      ? new Date(account.lastSyncedAt).toLocaleString()
                      : "never"}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                    <span>{formatCount(account.followerCount)} followers</span>
                    <span>{formatCount(account.videoCount)} videos</span>
                    <span>{formatCount(account.likesCount)} likes</span>
                    <span>{formatCount(account.viewCount)} views</span>
                    <span>{formatCount(account.commentCount)} comments</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/accounts/${account.id}`}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
                >
                  Open
                </Link>
                <button
                  type="button"
                  disabled={busyId === account.id}
                  onClick={() => onSync(account.id)}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-60"
                >
                  Sync
                </button>
                <button
                  type="button"
                  disabled={busyId === account.id}
                  onClick={() => onUnlink(account.id)}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Unlink
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CmsShell>
  );
}

export default function AccountsPage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
            Loading…
          </div>
        }
      >
        <AccountsContent />
      </Suspense>
    </RequireAuth>
  );
}
