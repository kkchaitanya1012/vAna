import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist_Mono, Inter } from "next/font/google";
import { SiteNav } from "@/components/site-nav";
import { AmbientBackground } from "@/components/ambient-background";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], axes: ["opsz"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "vAna",
  description: "Voice session analytics: see where the latency went.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="relative flex min-h-full flex-col">
        <a
          href="#main"
          className="btn fixed left-4 top-3 z-50 -translate-y-20 focus-visible:translate-y-0"
        >
          Skip to content
        </a>
        <AmbientBackground />
        <Suspense fallback={null}>
          <SiteNav />
        </Suspense>
        <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-32 pt-8 sm:px-6 sm:pb-16 sm:pt-12">{children}</main>
      </body>
    </html>
  );
}
