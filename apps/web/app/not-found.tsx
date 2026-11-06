import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel max-w-md rounded-panel p-7">
      <h1 className="display text-[28px] leading-tight">Nothing here</h1>
      <p className="mt-2 text-muted">
        This session or page does not exist. It may have been removed, or the link is incomplete.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/sessions" className="btn">All sessions</Link>
        <Link href="/" className="btn btn-quiet">New session</Link>
      </div>
    </div>
  );
}
