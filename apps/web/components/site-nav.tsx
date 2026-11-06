"use client";

import { ChartBar, ListBullets, Microphone } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "New session", short: "New", Icon: Microphone, match: (p: string) => p === "/" || p.startsWith("/live") },
  { href: "/sessions", label: "Sessions", short: "Sessions", Icon: ListBullets, match: (p: string) => p.startsWith("/sessions") },
  { href: "/compare", label: "Compare", short: "Compare", Icon: ChartBar, match: (p: string) => p.startsWith("/compare") },
];

/** Four bars, one per pipeline stage. The whole product in a glyph. */
export function Mark({ className = "" }: { className?: string }) {
  const bars = [
    ["var(--stage-hear)", 11],
    ["var(--stage-think)", 18],
    ["var(--stage-voice)", 8],
    ["var(--stage-deliver)", 14],
  ] as const;
  return (
    <span aria-hidden className={`flex h-[18px] items-end gap-[2.5px] ${className}`}>
      {bars.map(([c, h]) => (
        <span key={c} className="w-[4px] rounded-full" style={{ background: c, height: h }} />
      ))}
    </span>
  );
}

export function SiteNav() {
  const path = usePathname();
  return (
    <>
      <header className="sticky top-3 z-40 mx-auto w-full max-w-6xl px-3 sm:px-6">
        <div className="glass glass-nav flex h-14 items-center justify-between pl-5 pr-2">
          <Link href="/" className="flex items-center gap-2.5" aria-label="vAna home">
            <Mark />
            <span className="display text-[19px] leading-none">vAna</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {ITEMS.map(({ href, label, match }) => {
              const on = match(path);
              return (
                <Link key={href} href={href} aria-current={on ? "page" : undefined}
                      className={`rounded-full px-4 py-2 text-[13px] font-medium transition-colors duration-150 ${on ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}>
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* The live call is immersive: its own controls own the bottom of the phone screen. */}
      {!path.startsWith("/live") && (
      <nav aria-label="Main" className="fixed inset-x-3 bottom-3 z-40 pb-[env(safe-area-inset-bottom)] sm:hidden">
        <ul className="glass glass-nav mx-auto grid max-w-sm grid-cols-3 p-1.5">
          {ITEMS.map(({ href, short, Icon, match }) => {
            const on = match(path);
            return (
              <li key={href}>
                <Link href={href} aria-current={on ? "page" : undefined}
                      className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium transition-colors duration-150 ${on ? "bg-ink text-bg" : "text-muted"}`}>
                  <Icon size={19} weight={on ? "fill" : "regular"} aria-hidden />
                  {short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      )}
    </>
  );
}
