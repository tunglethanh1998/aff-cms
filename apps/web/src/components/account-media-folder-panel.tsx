"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccountMediaKind,
  AssetItem,
  bulkDeleteAccountMedia,
  deleteAccountMedia,
  listAccountMedia,
  uploadAccountMedia,
} from "@/lib/api";

const LABELS: Record<
  AccountMediaKind,
  { title: string; singular: string; hint: string }
> = {
  portraits: {
    title: "Portraits",
    singular: "portrait",
    hint: "Upload face images for this shop. Assign one to each product folder in Assets.",
  },
  backgrounds: {
    title: "Backgrounds",
    singular: "background",
    hint: "Upload background images for this shop. Assign one to each product folder in Assets.",
  },
};

export function AccountMediaFolderPanel({
  accountId,
  kind,
}: {
  accountId: string;
  kind: AccountMediaKind;
}) {
  const labels = LABELS[kind];
  const [items, setItems] = useState<AssetItem[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const allChecked =
    itemIds.length > 0 && itemIds.every((id) => checkedIds.has(id));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAccountMedia(accountId, kind);
      setItems(result.items);
      const valid = new Set(result.items.map((item) => item.id));
      setCheckedIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if (valid.has(id)) next.add(id);
        }
        return next;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Failed to load ${labels.title}`,
      );
    } finally {
      setLoading(false);
    }
  }, [accountId, kind, labels.title]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleChecked(id: string, checked: boolean) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      let count = 0;
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          throw new Error(`Skipped non-image: ${file.name}`);
        }
        await uploadAccountMedia(accountId, kind, file);
        count += 1;
      }
      setMessage(`Uploaded ${count} ${labels.singular}(s).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(assetId: string) {
    if (!window.confirm(`Delete this ${labels.singular}?`)) return;
    setBusyId(assetId);
    setError(null);
    setMessage(null);
    try {
      const result = await deleteAccountMedia(accountId, kind, assetId);
      setItems(result.items);
      setCheckedIds((prev) => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
      setMessage(`${labels.singular} deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onBulkDelete() {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} selected ${labels.singular}(s)? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await bulkDeleteAccountMedia(accountId, kind, ids);
      setItems(result.items);
      setCheckedIds(new Set());
      if (result.failedCount > 0) {
        setError(
          `Deleted ${result.deletedCount}, failed ${result.failedCount}.`,
        );
      } else {
        setMessage(`Deleted ${result.deletedCount} ${labels.singular}(s).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-sm text-muted">{labels.hint}</p>
        <div className="mt-4">
          <label className="inline-flex cursor-pointer items-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(event) => {
                void onUpload(event.target.files);
                event.target.value = "";
              }}
            />
            {uploading ? "Uploading…" : `Upload ${labels.title.toLowerCase()}`}
          </label>
        </div>
      </div>

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
          No {labels.title.toLowerCase()} yet. Upload images to get started.
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 sm:flex-row">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(event) =>
                  setCheckedIds(
                    event.target.checked ? new Set(itemIds) : new Set(),
                  )
                }
                className="h-3.5 w-3.5 accent-accent"
              />
              Select all
            </label>
            <button
              type="button"
              disabled={checkedIds.size === 0 || deleting}
              onClick={() => void onBulkDelete()}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-danger disabled:opacity-40"
            >
              {deleting
                ? "Deleting…"
                : `Delete selected (${checkedIds.size})`}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => {
              const isChecked = checkedIds.has(item.id);
              return (
                <article
                  key={item.id}
                  className={`relative overflow-hidden rounded-xl border bg-surface text-center ${
                    isChecked
                      ? "border-accent ring-1 ring-accent"
                      : "border-line"
                  }`}
                >
                  <label className="absolute top-2 left-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-white/90 shadow-sm">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(event) =>
                        toggleChecked(item.id, event.target.checked)
                      }
                      aria-label={`Select ${item.originalName}`}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleChecked(item.id, !isChecked)}
                    className="block w-full cursor-pointer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.originalName}
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                  <div className="space-y-2 p-3">
                    <p className="truncate text-xs font-medium">
                      {item.originalName}
                    </p>
                    <button
                      type="button"
                      disabled={busyId === item.id || deleting}
                      onClick={() => void onDelete(item.id)}
                      className="w-full text-xs text-danger disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
