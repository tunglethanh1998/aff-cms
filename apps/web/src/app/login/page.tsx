"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const LOGIN_HIGHLIGHTS = [
  {
    src: "/images/login-accounts.png",
    alt: "Connected TikTok accounts",
    label: "Accounts",
  },
  {
    src: "/images/login-create.png",
    alt: "Create affiliate product content",
    label: "Create",
  },
  {
    src: "/images/login-analytics.png",
    alt: "Track affiliate performance",
    label: "Insights",
  },
] as const;

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#d9f0e6_0%,transparent_42%),radial-gradient(circle_at_80%_0%,#e7eef8_0%,transparent_40%)]" />
      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-md space-y-6 rounded-2xl border border-line bg-surface p-8 shadow-[0_20px_60px_-40px_rgba(18,20,23,0.45)]"
      >
        <div className="space-y-2">
          <p className="text-[12px] font-semibold tracking-[0.22em] text-accent uppercase">
            Aff TikTok
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted">
            Manage TikTok accounts, videos, and inbox drafts.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              CSS background-image (1)
            </p>
            <div
              role="img"
              aria-label="Login background image cache test"
              title="/images/login-create.png via background-image"
              className="h-24 w-full rounded-xl border border-line bg-cover bg-center bg-[url('/images/login-create.png')]"
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              next/image (3)
            </p>
            <ul className="grid grid-cols-3 gap-2.5">
              {LOGIN_HIGHLIGHTS.map((item) => (
                <li
                  key={`next-${item.src}`}
                  className="overflow-hidden rounded-xl border border-line bg-background"
                >
                  <Image
                    src={item.src}
                    alt={item.alt}
                    width={240}
                    height={240}
                    quality={1}
                    className="aspect-square h-auto w-full object-cover"
                    priority
                  />
                  <p className="px-2 py-1.5 text-center text-[11px] font-medium text-muted">
                    {item.label}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              {'<img>'} native (3)
            </p>
            <ul className="grid grid-cols-3 gap-2.5">
              {LOGIN_HIGHLIGHTS.map((item) => (
                <li
                  key={`img-${item.src}`}
                  className="overflow-hidden rounded-xl border border-line bg-background"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- intentional A/B vs next/image */}
                  <img
                    src={item.src}
                    alt={item.alt}
                    width={240}
                    height={240}
                    className="aspect-square h-auto w-full object-cover"
                  />
                  <p className="px-2 py-1.5 text-center text-[11px] font-medium text-muted">
                    {item.label}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-foreground/80">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-line bg-background px-3.5 py-2.5 outline-none focus:border-accent"
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-foreground/80">Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-line bg-background px-3.5 py-2.5 outline-none focus:border-accent"
          />
        </label>

        {error ? (
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
