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
  syncAccount,
  TikTokAccount,
  uploadDraft,
} from "@/lib/api";

function AccountDetailContent() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [account, setAccount] = useState<TikTokAccount | null>(null);
  const [drafts, setDrafts] = useState<DraftJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [acc, jobs] = await Promise.all([getAccount(id), listDrafts(id)]);
      setAccount(acc);
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
    setError(null);
    try {
      setAccount(await syncAccount(id));
      setMessage("Metrics synced from TikTok.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    }
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
          "Draft sent to TikTok Inbox. Open the TikTok app notification to finish editing/posting.",
        );
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

  return (
    <CmsShell title={account?.displayName || "TikTok account"}>
      <div className="mb-6">
        <Link href="/accounts" className="text-sm text-sky-800 hover:underline">
          ← Back to accounts
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : !account ? (
        <p className="text-sm text-red-600">Account not found</p>
      ) : (
        <div className="space-y-10">
          <section className="flex flex-col gap-4 border border-zinc-200 bg-white/80 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {account.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={account.avatarUrl}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-200 text-sm text-zinc-500">
                  TT
                </div>
              )}
              <div>
                <h2 className="text-xl font-medium">
                  {account.displayName || account.username || account.openId}
                </h2>
                <p className="text-sm text-zinc-500">
                  @{account.username || "unknown"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSync}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              Sync metrics
            </button>
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Followers", account.followerCount],
              ["Videos", account.videoCount],
              ["Likes", account.likesCount],
              ["Views", account.viewCount],
              ["Comments", account.commentCount],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border border-zinc-200 bg-white/80 px-3 py-4"
              >
                <p className="text-xs tracking-wide text-zinc-500 uppercase">
                  {label}
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {formatCount(value)}
                </p>
              </div>
            ))}
          </section>

          <section className="space-y-4 border border-zinc-200 bg-white/80 p-5">
            <div>
              <h3 className="text-lg font-medium">Post video as draft</h3>
              <p className="mt-1 text-sm text-zinc-600">
                Uploads to TikTok Inbox via Content Posting API. Finish the post
                in the TikTok app.
              </p>
            </div>

            <form onSubmit={onUpload} className="space-y-4">
              <label className="block space-y-1.5 text-sm">
                <span className="text-zinc-600">Video file</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm"
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="text-zinc-600">CMS note (optional)</span>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-sky-500"
                  placeholder="Internal note for this draft job"
                />
              </label>
              <button
                type="submit"
                disabled={uploading || !file}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {uploading ? "Uploading…" : "Send to TikTok Inbox"}
              </button>
            </form>

            {message ? (
              <p className="text-sm text-emerald-700">{message}</p>
            ) : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-medium">Draft jobs</h3>
            {drafts.length === 0 ? (
              <p className="text-sm text-zinc-500">No draft uploads yet.</p>
            ) : (
              <ul className="space-y-2">
                {drafts.map((job) => (
                  <li
                    key={job.id}
                    className="border border-zinc-200 bg-white/80 px-4 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{job.localFileName}</span>
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs tracking-wide uppercase">
                        {job.status}
                      </span>
                    </div>
                    <p className="mt-1 text-zinc-500">
                      {new Date(job.createdAt).toLocaleString()}
                      {job.tiktokPublishId
                        ? ` · publish_id ${job.tiktokPublishId}`
                        : ""}
                    </p>
                    {job.caption ? (
                      <p className="mt-1 text-zinc-600">Note: {job.caption}</p>
                    ) : null}
                    {job.errorMessage ? (
                      <p className="mt-1 text-red-600">{job.errorMessage}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </CmsShell>
  );
}

export default function AccountDetailPage() {
  return (
    <RequireAuth>
      <AccountDetailContent />
    </RequireAuth>
  );
}
