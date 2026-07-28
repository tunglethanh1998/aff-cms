"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  createDailyProduct,
  DailyProductItem,
  deleteDailyProduct,
  listDailyProducts,
  resyncDailyProduct,
} from "@/lib/api";

function todayLocalYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function statusLabel(status: DailyProductItem["status"]) {
  switch (status) {
    case "READY":
      return "Ready";
    case "SYNCING":
      return "Syncing";
    case "FAILED":
      return "Failed";
    default:
      return "Pending";
  }
}

function statusClass(status: DailyProductItem["status"]) {
  switch (status) {
    case "READY":
      return "bg-accent-soft text-accent";
    case "SYNCING":
      return "bg-background text-muted";
    case "FAILED":
      return "bg-danger-soft text-danger";
    default:
      return "bg-background text-muted";
  }
}

export function AccountDailyProductsPanel({
  accountId,
}: {
  accountId: string;
}) {
  const [date, setDate] = useState(todayLocalYmd);
  const [productUrl, setProductUrl] = useState("");
  const [items, setItems] = useState<DailyProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listDailyProducts(accountId, date);
      setItems(result.items);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load daily products",
      );
    } finally {
      setLoading(false);
    }
  }, [accountId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!productUrl.trim()) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const created = await createDailyProduct(
        accountId,
        date,
        productUrl.trim(),
      );
      setProductUrl("");
      setMessage(
        created.status === "READY"
          ? `Added ${created.folderName} with ${created.imageCount} image(s).`
          : `Added ${created.folderName}. Sync status: ${statusLabel(created.status)}.`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add daily product",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onResync(id: string) {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      const updated = await resyncDailyProduct(accountId, id);
      setMessage(
        updated.status === "READY"
          ? `Resynced ${updated.folderName}: ${updated.imageCount} image(s).`
          : `Resync finished with status ${statusLabel(updated.status)}.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resync");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string, folderName: string) {
    if (
      !window.confirm(
        `Remove ${folderName} from this day? Folder and images are kept in this shop’s Assets.`,
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      await deleteDailyProduct(accountId, id);
      setMessage(`Removed ${folderName}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-line bg-surface p-5 shadow-sm"
      >
        <p className="mb-4 text-sm text-muted">
          Products are stored per shop under{" "}
          <code className="text-foreground">
            account/…/YYYY/DD-MM-YYYY/sp_N
          </code>
          .
        </p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <label className="block space-y-1.5 text-sm lg:w-44">
            <span className="text-muted">Date</span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-lg border border-line bg-background px-3 py-2 outline-none focus:border-accent"
              required
            />
          </label>
          <label className="block min-w-0 flex-1 space-y-1.5 text-sm">
            <span className="text-muted">Product URL</span>
            <input
              type="url"
              value={productUrl}
              onChange={(event) => setProductUrl(event.target.value)}
              placeholder="https://www.tiktok.com/view/product/..."
              className="w-full rounded-lg border border-line bg-background px-3 py-2 outline-none focus:border-accent"
              required
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Adding…" : "Add product"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm text-accent">
          {message}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-5 py-10 text-center text-sm text-muted">
          No products for this shop/day yet. Paste a link above to create{" "}
          <code className="text-foreground">sp_1</code>.
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-line bg-surface p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight">
                      {item.folderName}
                    </h2>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(item.status)}`}
                    >
                      {statusLabel(item.status)}
                    </span>
                    <span className="text-xs text-muted">
                      {item.imageCount} image
                      {item.imageCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="truncate text-sm text-muted">
                    <span className="text-foreground/80">
                      {item.folderPath}
                    </span>
                  </p>
                  {item.title ? (
                    <p className="text-sm text-foreground">{item.title}</p>
                  ) : null}
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm text-accent hover:underline"
                  >
                    {item.productUrl}
                  </a>
                  {item.errorMessage ? (
                    <p className="text-sm text-danger">{item.errorMessage}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/accounts/${accountId}?tab=library&media=assets&folderId=${encodeURIComponent(item.folderId)}`}
                    className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:border-foreground/20 hover:text-foreground"
                  >
                    Open folder
                  </Link>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void onResync(item.id)}
                    className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:border-foreground/20 hover:text-foreground disabled:opacity-60"
                  >
                    {busyId === item.id ? "Working…" : "Resync"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void onDelete(item.id, item.folderName)}
                    className="rounded-lg border border-danger/30 px-3 py-1.5 text-sm text-danger hover:bg-danger-soft disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {item.assets.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {item.assets.map((asset) => (
                    <a
                      key={asset.id}
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group overflow-hidden rounded-xl border border-line bg-background"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.url}
                        alt={asset.originalName}
                        className="aspect-square w-full object-cover transition group-hover:opacity-90"
                      />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">
                  No images yet. Resync or upload manually in this shop’s
                  Assets.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
