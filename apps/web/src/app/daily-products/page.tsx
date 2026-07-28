"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AccountDailyProductsPanel } from "@/components/account-daily-products-panel";
import { CmsShell } from "@/components/cms-shell";
import { RequireAuth } from "@/components/require-auth";
import { listAccounts, TikTokAccount } from "@/lib/api";

export default function DailyProductsPage() {
  return (
    <RequireAuth>
      <DailyProductsContent />
    </RequireAuth>
  );
}

function DailyProductsContent() {
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listAccounts();
      setAccounts(items);
      setAccountId((prev) => prev || items[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const selected = accounts.find((account) => account.id === accountId) ?? null;

  return (
    <CmsShell
      title="Daily products"
      subtitle="Pick a shop first. Each account has its own product folders and synced images."
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted">Shop / TikTok account</span>
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              disabled={loading || accounts.length === 0}
              className="w-full max-w-md rounded-lg border border-line bg-background px-3 py-2 outline-none focus:border-accent disabled:opacity-60"
            >
              {accounts.length === 0 ? (
                <option value="">No accounts connected</option>
              ) : (
                accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName ||
                      account.username ||
                      account.openId}
                  </option>
                ))
              )}
            </select>
          </label>
          {selected ? (
            <p className="mt-3 text-sm text-muted">
              Working in{" "}
              <Link
                href={`/accounts/${selected.id}?tab=daily`}
                className="text-accent hover:underline"
              >
                {selected.displayName || selected.username || selected.openId}
              </Link>
              ’s library.
            </p>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted">Loading accounts…</p>
        ) : !accountId ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-5 py-10 text-center text-sm text-muted">
            Connect a TikTok account first, then add daily products for that
            shop.
          </div>
        ) : (
          <AccountDailyProductsPanel accountId={accountId} />
        )}
      </div>
    </CmsShell>
  );
}
