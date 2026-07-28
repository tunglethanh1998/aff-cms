"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function CmsShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const onAccounts = pathname.startsWith("/accounts");
  const onDailyProducts = pathname.startsWith("/daily-products");
  const onAssets = pathname.startsWith("/assets");
  const onPrompts = pathname.startsWith("/prompts");

  const navItems = [
    { href: "/accounts", label: "Accounts", active: onAccounts },
    {
      href: "/daily-products",
      label: "Daily products",
      active: onDailyProducts,
    },
    { href: "/assets", label: "Assets", active: onAssets },
    { href: "/prompts", label: "Prompts", active: onPrompts },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-8">
            <Link
              href="/accounts"
              className="text-[13px] font-semibold tracking-[0.22em] text-accent uppercase"
            >
              Aff CMS
            </Link>
            <nav className="hidden items-center gap-1 text-sm sm:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 ${
                    item.active
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-muted hover:bg-background hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted md:inline">{user?.email}</span>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="rounded-lg border border-line px-3 py-1.5 text-muted hover:border-foreground/20 hover:text-foreground"
            >
              Log out
            </button>
          </div>
        </div>
        <nav className="mx-auto grid max-w-6xl grid-cols-4 gap-1 border-t border-line px-3 py-2 text-xs sm:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`rounded-lg px-2 py-2 text-center ${
                item.active
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-muted"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? (
              <p className="max-w-2xl text-sm text-muted">{subtitle}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
        {children}
      </main>
    </div>
  );
}
