"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("admin@affcms.local");
  const [password, setPassword] = useState("admin123456");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/accounts");
  }, [user, loading, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/accounts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#e8f1ff,_#f7f8fa_45%,_#ffffff)] px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-5 border border-zinc-200 bg-white/80 p-8 shadow-sm"
      >
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.2em] text-sky-800 uppercase">
            Aff CMS
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Admin login</h1>
          <p className="text-sm text-zinc-500">
            Sign in with the seeded admin account to manage TikTok accounts.
          </p>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="text-zinc-600">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-sky-500"
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="text-zinc-600">Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-sky-500"
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
