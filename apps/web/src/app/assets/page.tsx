"use client";

import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { CmsShell } from "@/components/cms-shell";
import { RequireAuth } from "@/components/require-auth";
import {
  AssetFolderTreeNode,
  AssetItem,
  bulkDeleteAssetFolders,
  bulkDeleteAssets,
  createAssetFolder,
  deleteAsset,
  deleteAssetFolder,
  downloadAsset,
  downloadAssetsZip,
  getAssetFolderTree,
  listAssets,
  seedDefaultAssetFolders,
  uploadAssetImage,
} from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

function formatBytes(value: string | number) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function collectExpandIds(
  nodes: AssetFolderTreeNode[],
  selectedId: string | null,
): Set<string> {
  const expanded = new Set<string>();

  function walk(list: AssetFolderTreeNode[], parents: string[]): boolean {
    let found = false;
    for (const node of list) {
      const hit =
        node.id === selectedId || walk(node.children, [...parents, node.id]);
      if (hit) {
        for (const id of parents) expanded.add(id);
        expanded.add(node.id);
        found = true;
      }
    }
    return found;
  }

  walk(nodes, []);
  return expanded;
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
  expandedIds,
  checkedIds,
  onToggle,
  onSelect,
  onCheck,
  onDelete,
  depth = 0,
}: {
  nodes: AssetFolderTreeNode[];
  selectedId: string | null;
  expandedIds: Set<string>;
  checkedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: AssetFolderTreeNode) => void;
  onCheck: (id: string, checked: boolean) => void;
  onDelete: (node: AssetFolderTreeNode) => void;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? "space-y-0.5" : "mt-0.5 space-y-0.5"}>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);
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
                aria-label={isExpanded ? "Collapse" : "Expand"}
                disabled={!hasChildren}
                onClick={() => onToggle(node.id)}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs ${
                  hasChildren
                    ? "text-muted hover:text-foreground"
                    : "text-transparent"
                }`}
              >
                {hasChildren ? (isExpanded ? "▾" : "▸") : "·"}
              </button>

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

            {hasChildren && isExpanded ? (
              <FolderTree
                nodes={node.children}
                selectedId={selectedId}
                expandedIds={expandedIds}
                checkedIds={checkedIds}
                onToggle={onToggle}
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

export default function AssetsPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<div className="p-8 text-sm text-muted">Loading…</div>}>
        <AssetsContent />
      </Suspense>
    </RequireAuth>
  );
}

function AssetsContent() {
  const searchParams = useSearchParams();
  const queryFolderId = searchParams.get("folderId");
  const [tree, setTree] = useState<AssetFolderTreeNode[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [folderId, setFolderId] = useState<string | null>(queryFolderId);
  const [selectedPath, setSelectedPath] = useState<string>("/");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [checkedFolderIds, setCheckedFolderIds] = useState<Set<string>>(
    new Set(),
  );
  const [checkedAssetIds, setCheckedAssetIds] = useState<Set<string>>(
    new Set(),
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingFolders, setDeletingFolders] = useState(false);
  const [deletingAssets, setDeletingAssets] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!queryFolderId) return;
    setFolderId(queryFolderId);
    setPage(1);
  }, [queryFolderId]);

  const allFolderIds = useMemo(() => collectFolderIds(tree), [tree]);
  const allFoldersChecked =
    allFolderIds.length > 0 &&
    allFolderIds.every((id) => checkedFolderIds.has(id));
  const someFoldersChecked = checkedFolderIds.size > 0;

  const pageAssetIds = useMemo(() => assets.map((a) => a.id), [assets]);
  const allAssetsChecked =
    pageAssetIds.length > 0 &&
    pageAssetIds.every((id) => checkedAssetIds.has(id));
  const someAssetsChecked = checkedAssetIds.size > 0;

  const loadTree = useCallback(async () => {
    const nextTree = await getAssetFolderTree();
    setTree(nextTree);
    const validIds = new Set(collectFolderIds(nextTree));
    setCheckedFolderIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
      }
      return next;
    });
    setExpandedIds((prev) => {
      const auto = collectExpandIds(nextTree, folderId);
      return new Set([...prev, ...auto]);
    });
    if (folderId) {
      const selected = findFolderById(nextTree, folderId);
      if (selected) {
        setSelectedPath(`/${selected.path}`);
      }
    }
  }, [folderId]);

  const loadAssets = useCallback(async () => {
    const assetPage = await listAssets({
      folderId: folderId || undefined,
      page,
      limit: 24,
      q: searchQuery || undefined,
    });
    setAssets(assetPage.items);
    setTotalPages(assetPage.totalPages);
    setTotal(assetPage.total);
    const validIds = new Set(assetPage.items.map((item) => item.id));
    setCheckedAssetIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [folderId, page, searchQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadTree(), loadAssets()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, [loadTree, loadAssets]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedLabel = useMemo(() => selectedPath, [selectedPath]);

  async function onSeedDefaults() {
    setError(null);
    setMessage(null);
    try {
      await seedDefaultAssetFolders();
      setMessage(
        "Default folders ready: products, creatives, thumbnails, brand, accounts.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed folders");
    }
  }

  async function onCreateFolder(event: FormEvent) {
    event.preventDefault();
    if (!newFolderName.trim()) return;
    setError(null);
    try {
      const created = await createAssetFolder(newFolderName.trim(), folderId);
      setNewFolderName("");
      if (folderId) {
        setExpandedIds((prev) => new Set(prev).add(folderId));
      }
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
        await uploadAssetImage(file, folderId);
        count += 1;
      }
      setMessage(`Uploaded ${count} image(s) to S3.`);
      setPage(1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function selectRoot() {
    setFolderId(null);
    setSelectedPath("/");
    setPage(1);
    setCheckedAssetIds(new Set());
  }

  function selectFolder(node: AssetFolderTreeNode) {
    setFolderId(node.id);
    setSelectedPath(`/${node.path}`);
    setPage(1);
    setCheckedAssetIds(new Set());
    setExpandedIds((prev) => new Set(prev).add(node.id));
  }

  function toggleFolder(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onCheckFolder(id: string, checked: boolean) {
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
  }

  function onToggleAllFolders(checked: boolean) {
    setCheckedFolderIds(checked ? new Set(allFolderIds) : new Set());
  }

  async function onDeleteFolder(node: AssetFolderTreeNode) {
    if (!confirm(`Delete folder “${node.path}”? (must be empty)`)) return;
    try {
      await deleteAssetFolder(node.id);
      setCheckedFolderIds((prev) => {
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
      if (folderId === node.id) selectRoot();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete folder failed");
    }
  }

  async function onBulkDeleteFolders() {
    const ids = Array.from(checkedFolderIds);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} selected folder(s)? Empty folders only; non-empty ones will be skipped.`,
      )
    ) {
      return;
    }

    setDeletingFolders(true);
    setError(null);
    setMessage(null);
    try {
      const result = await bulkDeleteAssetFolders(ids);
      if (folderId && result.deleted.includes(folderId)) {
        selectRoot();
      }
      setCheckedFolderIds(new Set());
      if (result.failedCount > 0) {
        const reasons = result.failed
          .slice(0, 3)
          .map((item) => `${item.path || item.id}: ${item.reason}`)
          .join("; ");
        setError(
          `Deleted ${result.deletedCount}, failed ${result.failedCount}. ${reasons}`,
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

  function onCheckAsset(id: string, checked: boolean) {
    setCheckedAssetIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function onToggleAllAssets(checked: boolean) {
    setCheckedAssetIds(checked ? new Set(pageAssetIds) : new Set());
  }

  async function onBulkDeleteAssets() {
    const ids = Array.from(checkedAssetIds);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} selected image(s) from S3 + CMS? This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingAssets(true);
    setError(null);
    setMessage(null);
    try {
      const result = await bulkDeleteAssets(ids);
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
      await downloadAsset(assetId);
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
      await downloadAssetsZip(ids);
      setMessage(`Downloading zip of ${ids.length} original image(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <CmsShell
      title="Assets"
      subtitle="S3 image library with folder tree navigation."
      actions={
        <>
          <button
            type="button"
            onClick={onSeedDefaults}
            className="rounded-xl border border-line px-4 py-2.5 text-sm text-muted hover:text-foreground"
          >
            Seed default folders
          </button>
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
        </>
      }
    >
      {message ? (
        <p className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-center text-sm text-accent">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      <p className="mb-4 text-center text-sm text-muted">
        Current folder: <span className="font-medium text-foreground">{selectedLabel}</span>
      </p>

      <div className="mb-6 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-2 px-1 text-center text-xs font-medium tracking-wide text-muted uppercase">
            Folder tree
          </p>

          <form onSubmit={onCreateFolder} className="mb-3 flex gap-2 px-1">
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder here"
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
                  checked={allFoldersChecked}
                  onChange={(e) => onToggleAllFolders(e.target.checked)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                Select all
              </label>
              <button
                type="button"
                disabled={!someFoldersChecked || deletingFolders}
                onClick={() => void onBulkDeleteFolders()}
                className="rounded-lg border border-line px-2.5 py-1 text-xs text-danger disabled:opacity-40"
              >
                {deletingFolders
                  ? "Deleting…"
                  : `Delete selected (${checkedFolderIds.size})`}
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={selectRoot}
            className={`mb-1 flex w-full items-center rounded-lg px-2 py-2 text-left text-sm ${
              folderId === null
                ? "bg-accent-soft font-semibold text-accent"
                : "hover:bg-background"
            }`}
          >
            📁 Root
          </button>

          {loading && tree.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted">Loading…</p>
          ) : tree.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted">
              No folders yet. Seed defaults or create one.
            </p>
          ) : (
            <FolderTree
              nodes={tree}
              selectedId={folderId}
              expandedIds={expandedIds}
              checkedIds={checkedFolderIds}
              onToggle={toggleFolder}
              onSelect={selectFolder}
              onCheck={onCheckFolder}
              onDelete={onDeleteFolder}
            />
          )}
        </aside>

        <section className="rounded-2xl border border-line bg-surface">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearchQuery(searchInput.trim());
            }}
            className="flex flex-col items-center gap-2 border-b border-line px-4 py-3 sm:flex-row sm:justify-center"
          >
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search images in this folder…"
              className="w-full max-w-md rounded-xl border border-line bg-background px-3.5 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-white"
            >
              Search
            </button>
          </form>

          {loading ? (
            <div className="px-6 py-14 text-center text-sm text-muted">
              Loading assets…
            </div>
          ) : assets.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="font-medium">No images here</p>
              <p className="mt-1 text-sm text-muted">
                Upload images or choose another folder in the tree.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:flex-row">
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={allAssetsChecked}
                    onChange={(e) => onToggleAllAssets(e.target.checked)}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  Select all on this page
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={
                      !someAssetsChecked || downloading || deletingAssets
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
                    disabled={!someAssetsChecked || deletingAssets}
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
                          onChange={(e) =>
                            onCheckAsset(asset.id, e.target.checked)
                          }
                          aria-label={`Select ${asset.originalName}`}
                          className="h-3.5 w-3.5 accent-accent"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => onCheckAsset(asset.id, !isChecked)}
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
                                await deleteAsset(asset.id);
                                setCheckedAssetIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(asset.id);
                                  return next;
                                });
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
        </section>
      </div>
    </CmsShell>
  );
}
