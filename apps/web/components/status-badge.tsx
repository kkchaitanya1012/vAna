import type { SessionStatus } from "@/lib/api";

const STYLE: Record<SessionStatus, string> = {
  starting: "text-muted",
  live: "text-good bg-good/10",
  processing: "text-warn bg-warn/10",
  complete: "text-muted border border-line",
  failed: "text-bad bg-bad/10",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STYLE[status]}`}>
      {status}
    </span>
  );
}
