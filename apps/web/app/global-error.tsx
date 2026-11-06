"use client";

import "./globals.css";

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center px-4">
        <div role="alert" className="panel max-w-md rounded-panel p-7">
          <h1 className="display text-[28px] leading-tight">vAna could not start</h1>
          <p className="mt-2 text-muted">The app failed to render. Reload to try again.</p>
          <button type="button" onClick={() => retry()} className="btn mt-5">Try again</button>
        </div>
      </body>
    </html>
  );
}
