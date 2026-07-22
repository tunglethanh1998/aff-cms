"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { formatDateTime } from "@/lib/datetime";

function AccountsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
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

  async function onSync(id: string, event: React.MouseEvent) {
    event.stopPropagation();
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

  async function onUnlink(id: string, event: React.MouseEvent) {
    event.stopPropagation();
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
    <CmsShell
      title="TikTok accounts"
      subtitle="Connect accounts, sync metrics, browse videos, and send inbox drafts."
      actions={
        <button
          type="button"
          onClick={onConnect}
          className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          + Connect TikTok
        </button>
      }
    >
      {connected ? (
        <p className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
          Account connected. Open it to sync videos and upload drafts.
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-line bg-surface px-5 py-10 text-sm text-muted">
          Loading accounts…
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <p className="text-lg font-medium">No accounts yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Connect a TikTok account to pull followers, videos, and engagement
            stats automatically.
          </p>
          <button
            type="button"
            onClick={onConnect}
            className="mt-6 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Connect TikTok
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="hidden grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_0.9fr] gap-3 border-b border-line px-5 py-3 text-center text-xs font-medium tracking-wide text-muted uppercase sm:grid">
            <span>Account</span>
            <span>Followers</span>
            <span>Videos</span>
            <span>Views</span>
            <span>Actions</span>
          </div>
          <ul>
            {accounts.map((account, index) => {
              const name =
                account.displayName || account.username || account.openId;
              return (
                <li
                  key={account.id}
                  className={`cursor-pointer px-5 py-4 transition-colors hover:bg-background/80 ${
                    index < accounts.length - 1 ? "border-b border-line" : ""
                  }`}
                  onClick={() => router.push(`/accounts/${account.id}`)}
                >
                  <div className="grid items-center gap-3 text-center sm:grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_0.9fr]">
                    <div className="flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:justify-center">
                      {account.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={account.avatarUrl}
                          alt=""
                          className="h-11 w-11 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                          TT
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{name}</p>
                        <p className="truncate text-sm text-muted">
                          @{account.username || "unknown"} · synced{" "}
                          {account.lastSyncedAt
                            ? formatDateTime(account.lastSyncedAt)
                            : "never"}
                        </p>
                      </div>
                    </div>

                    <div className="text-sm">
                      <span className="mr-2 text-muted sm:hidden">
                        Followers
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatCount(account.followerCount)}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="mr-2 text-muted sm:hidden">Videos</span>
                      <span className="font-medium tabular-nums">
                        {formatCount(account.videoCount)}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="mr-2 text-muted sm:hidden">Views</span>
                      <span className="font-medium tabular-nums">
                        {formatCount(account.viewCount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-center gap-2">
                      <Link
                        href={`/accounts/${account.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-lg bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        disabled={busyId === account.id}
                        onClick={(e) => onSync(account.id, e)}
                        className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-60"
                      >
                        Sync
                      </button>
                      <button
                        type="button"
                        disabled={busyId === account.id}
                        onClick={(e) => onUnlink(account.id, e)}
                        className="rounded-lg px-2 py-1.5 text-sm text-danger hover:bg-danger-soft disabled:opacity-60"
                      >
                        Unlink
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </CmsShell>
  );
}

export default function AccountsPage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-sm text-muted">
            Loading…
          </div>
        }
      >
        <AccountsContent />
      </Suspense>
    </RequireAuth>
  );
}
