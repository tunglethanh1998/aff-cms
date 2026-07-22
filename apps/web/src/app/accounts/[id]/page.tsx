"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CmsShell } from "@/components/cms-shell";
import { RequireAuth } from "@/components/require-auth";
import {
  DraftJob,
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

type Tab = "videos" | "upload" | "drafts";

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
  const id = params.id;

  const [account, setAccount] = useState<TikTokAccount | null>(null);
  const [videos, setVideos] = useState<TikTokVideo[]>([]);
  const [drafts, setDrafts] = useState<DraftJob[]>([]);
  const [tab, setTab] = useState<Tab>("videos");
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
      setTab("videos");
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
        setTab("drafts");
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
          <section className="rounded-2xl border border-line bg-surface p-5 text-center sm:p-6">
            <div className="flex flex-col items-center gap-5">
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                {account.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={account.avatarUrl}
                    alt=""
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                    TT
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {name}
                  </h2>
                  <p className="text-sm text-muted">
                    @{account.username || "unknown"}
                  </p>
                </div>
              </div>
              <dl className="grid w-full grid-cols-3 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
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

          <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
            {(
              [
                ["videos", `Videos (${totalVideos})`],
                ["upload", "Upload draft"],
                ["drafts", `Draft jobs (${drafts.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                  tab === key
                    ? "bg-foreground text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

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
                        titleText ||
                        descriptionText ||
                        video.tiktokVideoId;

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

          {tab === "upload" ? (
            <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <div className="max-w-xl space-y-5">
                <div>
                  <h3 className="text-lg font-semibold">Send draft to Inbox</h3>
                  <p className="mt-1 text-sm text-muted">
                    Upload a video to TikTok Inbox. The creator finishes the
                    post in the TikTok app.
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
                    className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {uploading ? "Uploading…" : "Send to TikTok Inbox"}
                  </button>
                </form>
              </div>
            </section>
          ) : null}

          {tab === "drafts" ? (
            <section className="overflow-hidden rounded-2xl border border-line bg-surface">
              {drafts.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <p className="font-medium">No draft jobs yet</p>
                  <p className="mt-1 text-sm text-muted">
                    Uploads will appear here after you send a draft.
                  </p>
                </div>
              ) : (
                <ul>
                  {drafts.map((job, index) => (
                    <li
                      key={job.id}
                      className={`flex flex-col items-center gap-2 px-5 py-4 text-center ${
                        index < drafts.length - 1 ? "border-b border-line" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{job.localFileName}</p>
                        <p className="mt-0.5 text-sm text-muted">
                          {formatDateTime(job.createdAt)}
                          {job.tiktokPublishId
                            ? ` · ${job.tiktokPublishId}`
                            : ""}
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
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium tracking-wide uppercase ${statusTone(job.status)}`}
                      >
                        {job.status.replaceAll("_", " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      )}
    </CmsShell>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
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
      <AccountDetailContent />
    </RequireAuth>
  );
}
