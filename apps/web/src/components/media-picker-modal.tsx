"use client";

import { useEffect, useState } from "react";
import {
  AccountMediaKind,
  AssetItem,
  listAccountMedia,
} from "@/lib/api";

export function MediaPickerModal({
  accountId,
  kind,
  title,
  selectedId,
  onClose,
  onSelect,
}: {
  accountId: string;
  kind: AccountMediaKind;
  title: string;
  selectedId: string | null;
  onClose: () => void;
  onSelect: (asset: AssetItem | null) => void;
}) {
  const [items, setItems] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(selectedId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listAccountMedia(accountId, kind)
      .then((result) => {
        if (!cancelled) setItems(result.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, kind]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-5">
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted">
              No items yet. Upload some in the {kind} tab first.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map((item) => {
                const active = pickedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPickedId(item.id)}
                    onDoubleClick={() => {
                      setPickedId(item.id);
                      onSelect(item);
                      onClose();
                    }}
                    className={`overflow-hidden rounded-xl border text-left ${
                      active
                        ? "border-accent ring-1 ring-accent"
                        : "border-line hover:border-foreground/30"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.originalName}
                      className="aspect-square w-full object-cover"
                    />
                    <p className="truncate px-2 py-1.5 text-xs">
                      {item.originalName}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-foreground"
          >
            Clear selection
          </button>
          <button
            type="button"
            disabled={!pickedId}
            onClick={() => {
              const picked = items.find((item) => item.id === pickedId) ?? null;
              onSelect(picked);
              onClose();
            }}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            Use selected
          </button>
        </div>
      </div>
    </div>
  );
}
