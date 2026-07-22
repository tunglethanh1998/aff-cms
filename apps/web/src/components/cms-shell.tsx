"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function CmsShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e8f1ff,_#f7f8fa_45%,_#ffffff)] text-zinc-900">
      <header className="border-b border-zinc-200/80 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/accounts" className="text-sm font-semibold tracking-[0.18em] uppercase text-sky-800">
              Aff CMS
            </Link>
            <nav className="flex gap-4 text-sm text-zinc-600">
              <Link href="/accounts" className="hover:text-zinc-900">
                TikTok accounts
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-500">{user?.email}</span>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">{title}</h1>
        {children}
      </main>
    </div>
  );
}
