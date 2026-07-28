"use client";

import Link from "next/link";
import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { AccountAssetsPanel } from "@/components/account-assets-panel";
import { AccountDailyProductsPanel } from "@/components/account-daily-products-panel";
import { AccountBackgroundsPanel } from "@/components/account-backgrounds-panel";
import { AccountPortraitsPanel } from "@/components/account-portraits-panel";
import { CmsShell } from "@/components/cms-shell";
import { RequireAuth } from "@/components/require-auth";
import {
  DraftJob,
  bulkDeleteDrafts,
  deleteDraft,
  formatCount,
  getAccount,
  listDrafts,
  listVideos,
  syncAccount,
  TikTokAccount,
  TikTokVideo,
  uploadDraft,
} from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { mergeTags, splitTextEntities } from "@/lib/hashtags";

type Tab = "videos" | "publishing" | "daily" | "library";
type MediaTab = "assets" | "portraits" | "backgrounds";

function resolveTab(value: string | null): Tab {
  if (value === "videos" || value === "daily") return value;
  if (value === "publishing" || value === "upload" || value === "drafts") {
    return "publishing";
  }
  if (
    value === "library" ||
    value === "assets" ||
    value === "portraits" ||
    value === "backgrounds"
  ) {
    return "library";
  }
  return "videos";
}

function resolveMediaTab(
  tabValue: string | null,
  mediaValue: string | null,
): MediaTab {
  if (
    mediaValue === "assets" ||
    mediaValue === "portraits" ||
    mediaValue === "backgrounds"
  ) {
    return mediaValue;
  }
  if (
    tabValue === "assets" ||
    tabValue === "portraits" ||
    tabValue === "backgrounds"
  ) {
    return tabValue;
  }
  return "assets";
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function statusTone(status: DraftJob["status"]) {
  if (status === "SENT_TO_INBOX") return "bg-accent-soft text-accent";
  if (status === "FAILED") return "bg-danger-soft text-danger";
  return "bg-background text-muted";
}

function AccountDetailContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const id = params.id;
  const queryTab = searchParams.get("tab");
  const queryMedia = searchParams.get("media");
  const queryFolderId = searchParams.get("folderId");

  const [account, setAccount] = useState<TikTokAccount | null>(null);
  const [videos, setVideos] = useState<TikTokVideo[]>([]);
  const [drafts, setDrafts] = useState<DraftJob[]>([]);
  const [tab, setTab] = useState<Tab>(() => resolveTab(queryTab));
  const [mediaTab, setMediaTab] = useState<MediaTab>(() =>
    resolveMediaTab(queryTab, queryMedia),
  );

  const selectTab = useCallback(
    (next: Tab) => {
      setTab(next);
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("tab", next);
      if (next === "library") {
        nextParams.set("media", mediaTab);
      } else {
        nextParams.delete("media");
        nextParams.delete("folderId");
      }
      const qs = nextParams.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [mediaTab, pathname, router, searchParams],
  );

  const selectMediaTab = useCallback(
    (next: MediaTab) => {
      setTab("library");
      setMediaTab(next);
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("tab", "library");
      nextParams.set("media", next);
      if (next !== "assets") nextParams.delete("folderId");
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalVideos, setTotalVideos] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const pageSize = 10;

  useEffect(() => {
    setTab(resolveTab(queryTab));
    setMediaTab(resolveMediaTab(queryTab, queryMedia));
  }, [queryMedia, queryTab]);

  const loadVideos = useCallback(
    async (nextPage: number, q: string) => {
      setVideosLoading(true);
      setError(null);
      try {
        const result = await listVideos(id, {
          page: nextPage,
          limit: pageSize,
          q: q || undefined,
        });
        setVideos(result.items);
        setPage(result.page);
        setTotalPages(result.totalPages);
        setTotalVideos(result.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load videos");
      } finally {
        setVideosLoading(false);
      }
    },
    [id],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [acc, vids, jobs] = await Promise.all([
        getAccount(id),
        listVideos(id, { page: 1, limit: pageSize }),
        listDrafts(id),
      ]);
      setAccount(acc);
      setVideos(vids.items);
      setPage(vids.page);
      setTotalPages(vids.totalPages);
      setTotalVideos(vids.total);
      setDrafts(jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSync() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const acc = await syncAccount(id);
      setAccount(acc);
      setPage(1);
      setSearchInput("");
      setSearchQuery("");
      await loadVideos(1, "");
      setMessage("Synced metrics and videos from TikTok.");
      selectTab("videos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const nextQuery = searchInput.trim();
    setSearchQuery(nextQuery);
    setPage(1);
    void loadVideos(1, nextQuery);
  }

  async function onUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a video file first");
      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const job = await uploadDraft(id, file, caption || undefined);
      setDrafts((prev) => [job, ...prev]);
      if (job.status === "SENT_TO_INBOX") {
        setMessage(
          "Draft sent to TikTok Inbox. Finish editing in the TikTok app.",
        );
        selectTab("publishing");
      } else if (job.status === "FAILED") {
        setError(job.errorMessage || "Upload failed");
      }
      setFile(null);
      setCaption("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onDeleteDraft(jobId: string) {
    if (
      !confirm(
        "Remove this draft job from CMS? This does not delete anything on TikTok.",
      )
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await deleteDraft(id, jobId);
      setDrafts((prev) => prev.filter((job) => job.id !== jobId));
      setMessage("Draft job removed from CMS.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete draft failed");
    }
  }

  async function onClearAllDrafts() {
    if (
      !confirm(
        `Remove all ${drafts.length} draft job(s) from CMS? This does not delete anything on TikTok.`,
      )
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const result = await bulkDeleteDrafts(id);
      setDrafts([]);
      setMessage(`Removed ${result.deletedCount} draft job(s) from CMS.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear drafts failed");
    }
  }

  const name =
    account?.displayName || account?.username || account?.openId || "Account";

  return (
    <CmsShell
      title={loading ? "Account" : name}
      subtitle={
        account
          ? `@${account.username || "unknown"} · last sync ${
              account.lastSyncedAt
                ? formatDateTime(account.lastSyncedAt)
                : "never"
            }`
          : "Loading TikTok account details"
      }
      actions={
        account ? (
          <>
            <Link
              href="/accounts"
              className="rounded-xl border border-line px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              All accounts
            </Link>
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </>
        ) : null
      }
    >
      {loading ? (
        <div className="rounded-2xl border border-line bg-surface px-5 py-10 text-sm text-muted">
          Loading account…
        </div>
      ) : !account ? (
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          Account not found
        </p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                {account.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={account.avatarUrl}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                    TT
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold tracking-tight">
                    {name}
                  </h2>
                  <p className="text-sm text-muted">
                    @{account.username || "unknown"}
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-x-5 gap-y-3 text-sm sm:grid-cols-5 lg:min-w-[34rem]">
                {[
                  ["Followers", account.followerCount],
                  ["Videos", account.videoCount],
                  ["Likes", account.likesCount],
                  ["Views", account.viewCount],
                  ["Comments", account.commentCount],
                ].map(([label, value]) => (
                  <div key={label} className="text-center">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="mt-0.5 text-base font-semibold tabular-nums">
                      {formatCount(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {message ? (
            <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <nav
            aria-label="Account sections"
            className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-surface p-2 lg:grid-cols-4"
          >
            {(
              [
                ["videos", "Videos", `${totalVideos} synced`],
                ["publishing", "Publishing", `${drafts.length} draft jobs`],
                ["daily", "Daily products", "Product image sync"],
                ["library", "Media library", "Assets & references"],
              ] as const
            ).map(([key, label, description]) => (
              <button
                key={key}
                type="button"
                onClick={() => selectTab(key)}
                aria-current={tab === key ? "page" : undefined}
                className={`rounded-xl px-3 py-3 text-left ${
                  tab === key
                    ? "bg-foreground text-white shadow-sm"
                    : "text-foreground hover:bg-background"
                }`}
              >
                <span className="block text-sm font-semibold">{label}</span>
                <span
                  className={`mt-0.5 block text-xs ${
                    tab === key ? "text-white/70" : "text-muted"
                  }`}
                >
                  {description}
                </span>
              </button>
            ))}
          </nav>

          {tab === "videos" ? (
            <section className="overflow-hidden rounded-2xl border border-line bg-surface">
              <form
                onSubmit={onSearch}
                className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-center"
              >
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search title, hashtag, mention…"
                  className="w-full max-w-md rounded-xl border border-line bg-background px-3.5 py-2 text-sm outline-none focus:border-accent"
                />
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="submit"
                    className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Search
                  </button>
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput("");
                        setSearchQuery("");
                        setPage(1);
                        void loadVideos(1, "");
                      }}
                      className="rounded-xl border border-line px-3 py-2 text-sm text-muted hover:text-foreground"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </form>

              {videosLoading ? (
                <div className="px-6 py-14 text-center text-sm text-muted">
                  Loading videos…
                </div>
              ) : videos.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <p className="font-medium">
                    {searchQuery
                      ? "No videos match your search"
                      : "No videos synced yet"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {searchQuery
                      ? "Try another keyword, hashtag, or mention."
                      : "Click Sync now to fetch the latest videos from TikTok."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden grid-cols-[72px_minmax(0,1.3fr)_minmax(0,1.2fr)_0.5fr_0.5fr_0.5fr_0.5fr_0.85fr] gap-3 border-b border-line px-4 py-3 text-center text-xs font-medium tracking-wide text-muted uppercase lg:grid">
                    <span>Cover</span>
                    <span>Title</span>
                    <span>Hashtags / Mentions</span>
                    <span>Views</span>
                    <span>Likes</span>
                    <span>Comments</span>
                    <span>Shares</span>
                    <span>Posted</span>
                  </div>
                  <ul>
                    {videos.map((video, index) => {
                      const titleParts = splitTextEntities(video.title);
                      const descriptionParts = splitTextEntities(
                        video.description,
                      );
                      const hashtags = mergeTags(
                        titleParts.hashtags,
                        descriptionParts.hashtags,
                      );
                      const mentions = mergeTags(
                        titleParts.mentions,
                        descriptionParts.mentions,
                      );

                      const titleText = titleParts.text;
                      const descriptionText = descriptionParts.text;
                      const showDescription =
                        Boolean(descriptionText) &&
                        descriptionText !== titleText;
                      const displayTitle =
                        titleText || descriptionText || video.tiktokVideoId;

                      return (
                        <li
                          key={video.id}
                          className={`px-4 py-4 ${
                            index < videos.length - 1
                              ? "border-b border-line"
                              : ""
                          }`}
                        >
                          <div className="grid items-center gap-3 text-center lg:grid-cols-[72px_minmax(0,1.3fr)_minmax(0,1.2fr)_0.5fr_0.5fr_0.5fr_0.5fr_0.85fr]">
                            <div className="flex justify-center">
                              {video.coverUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={video.coverUrl}
                                  alt=""
                                  className="h-[72px] w-12 rounded-lg object-cover bg-background"
                                />
                              ) : (
                                <div className="flex h-[72px] w-12 items-center justify-center rounded-lg bg-background text-[10px] text-muted">
                                  N/A
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 space-y-1.5">
                              <p className="whitespace-pre-wrap break-words text-sm font-medium leading-snug">
                                {displayTitle}
                              </p>
                              {showDescription ? (
                                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
                                  {descriptionText}
                                </p>
                              ) : null}
                              <p className="text-xs text-muted">
                                {formatDuration(video.durationSec)}
                                {video.shareUrl ? (
                                  <>
                                    {" · "}
                                    <a
                                      href={video.shareUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-accent hover:underline"
                                    >
                                      Open
                                    </a>
                                  </>
                                ) : null}
                              </p>
                            </div>

                            <div className="min-w-0 space-y-2">
                              <p className="text-xs text-muted lg:hidden">
                                Hashtags / Mentions
                              </p>
                              {mentions.length === 0 &&
                              hashtags.length === 0 ? (
                                <span className="text-sm text-muted">—</span>
                              ) : (
                                <>
                                  <div>
                                    <p className="mb-1 text-[11px] font-medium tracking-wide text-muted uppercase">
                                      Hashtags
                                    </p>
                                    {hashtags.length > 0 ? (
                                      <div className="flex flex-wrap justify-center gap-1.5">
                                        {hashtags.map((tag) => (
                                          <span
                                            key={tag}
                                            className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
                                          >
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted">
                                        —
                                      </span>
                                    )}
                                  </div>
                                  <div className="border-t border-line pt-2">
                                    <p className="mb-1 text-[11px] font-medium tracking-wide text-muted uppercase">
                                      Mentions
                                    </p>
                                    {mentions.length > 0 ? (
                                      <div className="flex flex-wrap justify-center gap-1.5">
                                        {mentions.map((tag) => (
                                          <span
                                            key={tag}
                                            className="rounded-md bg-background px-2 py-0.5 text-xs font-medium text-foreground"
                                          >
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted">
                                        —
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>

                            <Metric label="Views" value={video.viewCount} />
                            <Metric label="Likes" value={video.likeCount} />
                            <Metric
                              label="Comments"
                              value={video.commentCount}
                            />
                            <Metric label="Shares" value={video.shareCount} />

                            <div className="text-sm tabular-nums text-muted lg:text-foreground">
                              <span className="mr-2 text-muted lg:hidden">
                                Posted
                              </span>
                              {formatDateTime(video.publishedAt)}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="flex flex-col items-center justify-center gap-3 border-t border-line px-4 py-4 text-sm sm:flex-row">
                    <p className="text-muted">
                      Page {page} / {totalPages} · {totalVideos} videos
                      {searchQuery ? ` · “${searchQuery}”` : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={page <= 1 || videosLoading}
                        onClick={() => void loadVideos(page - 1, searchQuery)}
                        className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={page >= totalPages || videosLoading}
                        onClick={() => void loadVideos(page + 1, searchQuery)}
                        className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          ) : null}

          {tab === "publishing" ? (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-accent uppercase">
                      New upload
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">
                      Send draft to Inbox
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      Upload a video here. The creator finishes editing and
                      posting in the TikTok app.
                    </p>
                  </div>
                  <form onSubmit={onUpload} className="space-y-4">
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">Video file</span>
                      <input
                        type="file"
                        accept="video/*"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="block w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent"
                      />
                    </label>
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">Note (optional)</span>
                      <input
                        type="text"
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        className="w-full rounded-xl border border-line bg-background px-3.5 py-2.5 outline-none focus:border-accent"
                        placeholder="Internal CMS note"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={uploading || !file}
                      className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {uploading ? "Uploading…" : "Send to TikTok Inbox"}
                    </button>
                  </form>
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-line bg-surface">
                <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                  <div>
                    <h3 className="font-semibold">Draft history</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {drafts.length} jobs stored in CMS
                    </p>
                  </div>
                  {drafts.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void onClearAllDrafts()}
                      className="rounded-lg border border-line px-3 py-1.5 text-sm text-danger"
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>

                {drafts.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <p className="font-medium">No draft jobs yet</p>
                    <p className="mt-1 text-sm text-muted">
                      New uploads will appear here.
                    </p>
                  </div>
                ) : (
                  <ul className="max-h-[36rem] overflow-y-auto">
                    {drafts.map((job, index) => (
                      <li
                        key={job.id}
                        className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between ${
                          index < drafts.length - 1
                            ? "border-b border-line"
                            : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {job.localFileName}
                          </p>
                          <p className="mt-0.5 text-sm text-muted">
                            {formatDateTime(job.createdAt)}
                          </p>
                          {job.caption ? (
                            <p className="mt-1 text-sm text-muted">
                              Note: {job.caption}
                            </p>
                          ) : null}
                          {job.errorMessage ? (
                            <p className="mt-1 text-sm text-danger">
                              {job.errorMessage}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium tracking-wide uppercase ${statusTone(job.status)}`}
                          >
                            {job.status.replaceAll("_", " ")}
                          </span>
                          <button
                            type="button"
                            onClick={() => void onDeleteDraft(job.id)}
                            className="rounded-lg border border-line px-2.5 py-1 text-xs text-danger"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}

          {tab === "daily" ? (
            <AccountDailyProductsPanel accountId={id} />
          ) : null}

          {tab === "library" ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="px-1">
                  <h3 className="text-sm font-semibold">Media library</h3>
                  <p className="text-xs text-muted">
                    Product images and reusable visual references.
                  </p>
                </div>
                <div
                  className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1"
                  role="tablist"
                  aria-label="Media library views"
                >
                  {(
                    [
                      ["assets", "Product assets"],
                      ["portraits", "Portraits"],
                      ["backgrounds", "Backgrounds"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={mediaTab === key}
                      onClick={() => selectMediaTab(key)}
                      className={`rounded-lg px-3 py-2 text-xs font-medium sm:text-sm ${
                        mediaTab === key
                          ? "bg-surface text-foreground shadow-sm"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {mediaTab === "assets" ? (
                <AccountAssetsPanel
                  accountId={id}
                  initialFolderId={queryFolderId}
                />
              ) : null}
              {mediaTab === "portraits" ? (
                <AccountPortraitsPanel accountId={id} />
              ) : null}
              {mediaTab === "backgrounds" ? (
                <AccountBackgroundsPanel accountId={id} />
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </CmsShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center text-sm">
      <span className="mr-2 text-muted lg:hidden">{label}</span>
      <span className="font-medium tabular-nums">{formatCount(value)}</span>
    </div>
  );
}

export default function AccountDetailPage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={<div className="p-8 text-sm text-muted">Loading…</div>}
      >
        <AccountDetailContent />
      </Suspense>
    </RequireAuth>
  );
}
