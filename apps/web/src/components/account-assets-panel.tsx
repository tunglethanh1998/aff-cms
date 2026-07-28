"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MediaPickerModal } from "@/components/media-picker-modal";
import {
  AssetFolderTreeNode,
  AssetItem,
  bulkDeleteAccountAssetFolders,
  bulkDeleteAccountAssets,
  createAccountAssetFolder,
  deleteAccountAsset,
  deleteAccountAssetFolder,
  downloadAccountAsset,
  downloadAccountAssetsZip,
  getAccountAssetFolderTree,
  listAccountAssets,
  updateAccountFolderCompanions,
  uploadAccountAssetImage,
} from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

function formatBytes(value: string | number) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function collectFolderIds(nodes: AssetFolderTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id, ...collectFolderIds(node.children));
  }
  return ids;
}

function collectSubtreeIds(node: AssetFolderTreeNode): string[] {
  return [node.id, ...collectFolderIds(node.children)];
}

function findFolderById(
  nodes: AssetFolderTreeNode[],
  id: string,
): AssetFolderTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const nested = findFolderById(node.children, id);
    if (nested) return nested;
  }
  return null;
}

function FolderTree({
  nodes,
  selectedId,
  checkedIds,
  onSelect,
  onCheck,
  onDelete,
  depth = 0,
}: {
  nodes: AssetFolderTreeNode[];
  selectedId: string | null;
  checkedIds: Set<string>;
  onSelect: (node: AssetFolderTreeNode) => void;
  onCheck: (id: string, checked: boolean) => void;
  onDelete: (node: AssetFolderTreeNode) => void;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? "space-y-0.5" : "mt-0.5 space-y-0.5"}>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isSelected = selectedId === node.id;
        const isChecked = checkedIds.has(node.id);

        return (
          <li key={node.id}>
            <div
              className={`group flex items-center gap-1 rounded-lg pr-1 ${
                isSelected ? "bg-accent-soft" : "hover:bg-background"
              }`}
              style={{ paddingLeft: `${depth * 14 + 4}px` }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => onCheck(node.id, e.target.checked)}
                aria-label={`Select folder ${node.name}`}
                className="h-3.5 w-3.5 shrink-0 accent-accent"
              />
              <button
                type="button"
                onClick={() => onSelect(node)}
                className={`min-w-0 flex-1 truncate py-1.5 text-left text-sm ${
                  isSelected ? "font-semibold text-accent" : "font-medium"
                }`}
                title={node.path}
              >
                {node.name}
                <span className="ml-1 text-xs font-normal text-muted">
                  ({node.assetCount})
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(node)}
                className="rounded px-1.5 py-1 text-[11px] text-danger opacity-0 group-hover:opacity-100"
              >
                Del
              </button>
            </div>
            {hasChildren ? (
              <FolderTree
                nodes={node.children}
                selectedId={selectedId}
                checkedIds={checkedIds}
                onSelect={onSelect}
                onCheck={onCheck}
                onDelete={onDelete}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function AccountAssetsPanel({
  accountId,
  initialFolderId = null,
}: {
  accountId: string;
  initialFolderId?: string | null;
}) {
  const [tree, setTree] = useState<AssetFolderTreeNode[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);
  const [checkedFolderIds, setCheckedFolderIds] = useState<Set<string>>(
    new Set(),
  );
  const [checkedAssetIds, setCheckedAssetIds] = useState<Set<string>>(
    new Set(),
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [newFolderName, setNewFolderName] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingFolders, setDeletingFolders] = useState(false);
  const [deletingAssets, setDeletingAssets] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [savingCompanion, setSavingCompanion] = useState(false);
  const [pickerKind, setPickerKind] = useState<"portraits" | "backgrounds" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const allFolderIds = useMemo(() => collectFolderIds(tree), [tree]);
  const pageAssetIds = useMemo(() => assets.map((a) => a.id), [assets]);
  const allAssetsChecked =
    pageAssetIds.length > 0 &&
    pageAssetIds.every((id) => checkedAssetIds.has(id));
  const rootFolder = tree[0] ?? null;
  const selectedFolder = useMemo(
    () => (folderId ? findFolderById(tree, folderId) : null),
    [tree, folderId],
  );
  const canSetCompanions = Boolean(
    selectedFolder &&
      selectedFolder.assetCount > 0 &&
      !selectedFolder.path.endsWith("/portraits") &&
      !selectedFolder.path.endsWith("/backgrounds"),
  );

  useEffect(() => {
    if (!initialFolderId) return;
    setFolderId(initialFolderId);
    setPage(1);
  }, [initialFolderId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextTree = await getAccountAssetFolderTree(accountId);
      setTree(nextTree);

      const rootId = nextTree[0]?.id ?? null;
      const activeFolderId =
        folderId && collectFolderIds(nextTree).includes(folderId)
          ? folderId
          : rootId;
      if (activeFolderId !== folderId) {
        setFolderId(activeFolderId);
      }

      const assetPage = await listAccountAssets(accountId, {
        folderId: activeFolderId || undefined,
        page,
        limit: 24,
      });
      setAssets(assetPage.items);
      setTotalPages(assetPage.totalPages);
      setTotal(assetPage.total);

      const validAssetIds = new Set(assetPage.items.map((item) => item.id));
      setCheckedAssetIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if (validAssetIds.has(id)) next.add(id);
        }
        return next;
      });

      const validFolderIds = new Set(collectFolderIds(nextTree));
      setCheckedFolderIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if (validFolderIds.has(id)) next.add(id);
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, [accountId, folderId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreateFolder(event: FormEvent) {
    event.preventDefault();
    if (!newFolderName.trim()) return;
    setError(null);
    try {
      const created = await createAccountAssetFolder(
        accountId,
        newFolderName.trim(),
        folderId || rootFolder?.id,
      );
      setNewFolderName("");
      setMessage(`Created folder “${created.name}”.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    }
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
        await uploadAccountAssetImage(accountId, file, folderId);
        count += 1;
      }
      setMessage(`Uploaded ${count} image(s) to this account library.`);
      setPage(1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onBulkDeleteFolders() {
    const ids = Array.from(checkedFolderIds);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} selected folder(s)? Empty folders only; account root cannot be deleted.`,
      )
    ) {
      return;
    }
    setDeletingFolders(true);
    setError(null);
    setMessage(null);
    try {
      const result = await bulkDeleteAccountAssetFolders(accountId, ids);
      setCheckedFolderIds(new Set());
      if (result.failedCount > 0) {
        setError(
          `Deleted ${result.deletedCount}, failed ${result.failedCount}.`,
        );
      } else {
        setMessage(`Deleted ${result.deletedCount} folder(s).`);
      }
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Bulk delete folders failed",
      );
    } finally {
      setDeletingFolders(false);
    }
  }

  async function onBulkDeleteAssets() {
    const ids = Array.from(checkedAssetIds);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} selected image(s) from this account? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingAssets(true);
    setError(null);
    setMessage(null);
    try {
      const result = await bulkDeleteAccountAssets(accountId, ids);
      setCheckedAssetIds(new Set());
      if (result.failedCount > 0) {
        setError(
          `Deleted ${result.deletedCount}, failed ${result.failedCount}.`,
        );
      } else {
        setMessage(`Deleted ${result.deletedCount} image(s).`);
      }
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Bulk delete images failed",
      );
    } finally {
      setDeletingAssets(false);
    }
  }

  async function onDownloadAsset(assetId: string) {
    setDownloading(true);
    setError(null);
    setMessage(null);
    try {
      await downloadAccountAsset(accountId, assetId);
      setMessage("Download started (original file).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function onBulkDownloadAssets() {
    const ids = Array.from(checkedAssetIds);
    if (ids.length === 0) return;
    setDownloading(true);
    setError(null);
    setMessage(null);
    try {
      await downloadAccountAssetsZip(accountId, ids);
      const extras = [
        selectedFolder?.portrait ? "portrait" : null,
        selectedFolder?.background ? "background" : null,
      ].filter(Boolean);
      setMessage(
        extras.length > 0
          ? `Downloading zip: ${ids.length} image(s) + folder ${extras.join(" + ")}.`
          : `Downloading zip of ${ids.length} original image(s).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function onSetCompanion(
    kind: "portraits" | "backgrounds",
    asset: AssetItem | null,
  ) {
    if (!folderId || !canSetCompanions) return;
    setSavingCompanion(true);
    setError(null);
    setMessage(null);
    try {
      await updateAccountFolderCompanions(accountId, folderId, {
        ...(kind === "portraits"
          ? { portraitAssetId: asset?.id ?? null }
          : { backgroundAssetId: asset?.id ?? null }),
      });
      setMessage(
        asset
          ? `${kind === "portraits" ? "Portrait" : "Background"} set for this folder.`
          : `${kind === "portraits" ? "Portrait" : "Background"} cleared.`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update companions",
      );
    } finally {
      setSavingCompanion(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-muted">
          Set portrait and background on each folder. Download selected images
          includes that folder&apos;s companions.
        </p>
        <label className="cursor-pointer rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
          {uploading ? "Uploading…" : "Upload images"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              void onUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {message ? (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-center text-sm text-accent">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-2 px-1 text-center text-xs font-medium tracking-wide text-muted uppercase">
            Folders
          </p>
          <form onSubmit={onCreateFolder} className="mb-3 flex gap-2 px-1">
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New subfolder"
              className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="rounded-xl border border-line px-3 py-2 text-sm"
            >
              Add
            </button>
          </form>

          {tree.length > 0 ? (
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={
                    allFolderIds.length > 0 &&
                    allFolderIds.every((id) => checkedFolderIds.has(id))
                  }
                  onChange={(e) =>
                    setCheckedFolderIds(
                      e.target.checked ? new Set(allFolderIds) : new Set(),
                    )
                  }
                  className="h-3.5 w-3.5 accent-accent"
                />
                Select all
              </label>
              <button
                type="button"
                disabled={checkedFolderIds.size === 0 || deletingFolders}
                onClick={() => void onBulkDeleteFolders()}
                className="rounded-lg border border-line px-2.5 py-1 text-xs text-danger disabled:opacity-40"
              >
                {deletingFolders
                  ? "Deleting…"
                  : `Delete (${checkedFolderIds.size})`}
              </button>
            </div>
          ) : null}

          {loading && tree.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted">Loading…</p>
          ) : (
            <FolderTree
              nodes={tree}
              selectedId={folderId}
              checkedIds={checkedFolderIds}
              onSelect={(node) => {
                setFolderId(node.id);
                setPage(1);
                setCheckedAssetIds(new Set());
              }}
              onCheck={(id, checked) => {
                const node = findFolderById(tree, id);
                const ids = node ? collectSubtreeIds(node) : [id];
                setCheckedFolderIds((prev) => {
                  const next = new Set(prev);
                  for (const folderIdToToggle of ids) {
                    if (checked) next.add(folderIdToToggle);
                    else next.delete(folderIdToToggle);
                  }
                  return next;
                });
              }}
              onDelete={async (node) => {
                if (!confirm(`Delete folder “${node.path}”? (must be empty)`)) {
                  return;
                }
                try {
                  await deleteAccountAssetFolder(accountId, node.id);
                  if (folderId === node.id) {
                    setFolderId(rootFolder?.id ?? null);
                  }
                  await load();
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Delete folder failed",
                  );
                }
              }}
            />
          )}
        </aside>

        <div className="rounded-2xl border border-line bg-surface">
          {canSetCompanions ? (
            <div className="grid gap-3 border-b border-line px-4 py-3 sm:grid-cols-2">
              {(
                [
                  {
                    kind: "portraits" as const,
                    label: "Portrait",
                    companion: selectedFolder?.portrait ?? null,
                  },
                  {
                    kind: "backgrounds" as const,
                    label: "Background",
                    companion: selectedFolder?.background ?? null,
                  },
                ] as const
              ).map(({ kind, label, companion }) => (
                <div
                  key={kind}
                  className="flex items-center gap-3 rounded-xl border border-line bg-background p-2.5"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
                    {companion ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={companion.url}
                        alt={companion.originalName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-muted">
                        None
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium tracking-wide text-muted uppercase">
                      {label}
                    </p>
                    <p className="truncate text-sm">
                      {companion ? companion.originalName : "Not set"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={savingCompanion}
                        onClick={() => setPickerKind(kind)}
                        className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-foreground disabled:opacity-40"
                      >
                        {companion ? "Replace" : "Set"}
                      </button>
                      {companion ? (
                        <button
                          type="button"
                          disabled={savingCompanion}
                          onClick={() => void onSetCompanion(kind, null)}
                          className="rounded-md border border-line px-2 py-1 text-xs text-danger disabled:opacity-40"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {loading ? (
            <div className="px-6 py-14 text-center text-sm text-muted">
              Loading assets…
            </div>
          ) : assets.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="font-medium">No images yet</p>
              <p className="mt-1 text-sm text-muted">
                Upload images for this account library.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:flex-row">
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={allAssetsChecked}
                    onChange={(e) =>
                      setCheckedAssetIds(
                        e.target.checked ? new Set(pageAssetIds) : new Set(),
                      )
                    }
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  Select all on this page
                </label>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={
                      checkedAssetIds.size === 0 ||
                      downloading ||
                      deletingAssets
                    }
                    onClick={() => void onBulkDownloadAssets()}
                    className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-40"
                  >
                    {downloading
                      ? "Downloading…"
                      : `Download selected (${checkedAssetIds.size})`}
                  </button>
                  <button
                    type="button"
                    disabled={checkedAssetIds.size === 0 || deletingAssets}
                    onClick={() => void onBulkDeleteAssets()}
                    className="rounded-lg border border-line px-3 py-1.5 text-sm text-danger disabled:opacity-40"
                  >
                    {deletingAssets
                      ? "Deleting…"
                      : `Delete selected (${checkedAssetIds.size})`}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
                {assets.map((asset) => {
                  const isChecked = checkedAssetIds.has(asset.id);
                  return (
                    <article
                      key={asset.id}
                      className={`relative overflow-hidden rounded-xl border bg-background text-center ${
                        isChecked
                          ? "border-accent ring-1 ring-accent"
                          : "border-line"
                      }`}
                    >
                      <label className="absolute top-2 left-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-white/90 shadow-sm">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            setCheckedAssetIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(asset.id);
                              else next.delete(asset.id);
                              return next;
                            });
                          }}
                          aria-label={`Select ${asset.originalName}`}
                          className="h-3.5 w-3.5 accent-accent"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setCheckedAssetIds((prev) => {
                            const next = new Set(prev);
                            if (isChecked) next.delete(asset.id);
                            else next.add(asset.id);
                            return next;
                          });
                        }}
                        aria-pressed={isChecked}
                        aria-label={
                          isChecked
                            ? `Deselect ${asset.originalName}`
                            : `Select ${asset.originalName}`
                        }
                        className="block w-full cursor-pointer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.url}
                          alt={asset.originalName}
                          className="aspect-square w-full object-cover"
                        />
                      </button>
                      <div className="space-y-1 p-2">
                        <p className="truncate text-xs font-medium">
                          {asset.originalName}
                        </p>
                        <p className="text-[11px] text-muted">
                          {formatBytes(asset.sizeBytes)} ·{" "}
                          {formatDateTime(asset.createdAt)}
                        </p>
                        <div className="flex flex-wrap justify-center gap-2 pt-1">
                          <a
                            href={asset.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-accent hover:underline"
                          >
                            Open
                          </a>
                          <button
                            type="button"
                            disabled={downloading}
                            onClick={() => void onDownloadAsset(asset.id)}
                            className="text-xs text-muted hover:text-foreground disabled:opacity-40"
                          >
                            Download
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                !confirm("Delete this image from S3 + CMS?")
                              ) {
                                return;
                              }
                              try {
                                await deleteAccountAsset(accountId, asset.id);
                                await load();
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "Delete failed",
                                );
                              }
                            }}
                            className="text-xs text-danger"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="flex flex-col items-center gap-2 border-t border-line px-4 py-3 text-sm sm:flex-row sm:justify-center">
                <p className="text-muted">
                  Page {page} / {totalPages} · {total} images
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {pickerKind ? (
        <MediaPickerModal
          accountId={accountId}
          kind={pickerKind}
          title={
            pickerKind === "portraits"
              ? "Set portrait for this folder"
              : "Set background for this folder"
          }
          selectedId={
            pickerKind === "portraits"
              ? selectedFolder?.portrait?.id ?? null
              : selectedFolder?.background?.id ?? null
          }
          onClose={() => setPickerKind(null)}
          onSelect={(asset) => {
            void onSetCompanion(pickerKind, asset);
          }}
        />
      ) : null}
    </section>
  );
}
