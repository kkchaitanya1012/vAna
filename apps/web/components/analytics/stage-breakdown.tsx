import { fmtMs } from "@/lib/format";
import { STAGES, stageValues, type StageKey } from "@/lib/stages";
import type { TurnOut } from "@/lib/api";

export function StageBreakdown({ turns }: { turns: TurnOut[] }) {
  const avg = STAGES.map((s) => {
    const xs = turns.map((t) => stageValues(t.stages)[s.key]).filter((v): v is number => v != null);
    return { ...s, ms: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0 };
  });
  const total = avg.reduce((a, b) => a + b.ms, 0);
  const slowest = avg.reduce((a, b) => (b.ms > a.ms ? b : a), avg[0]);
  if (total === 0) return null;

  return (
    <div>
      <div className="flex h-9 items-center gap-[2px]" role="img"
           aria-label={`Average ${fmtMs(total)} split across ${STAGES.length} steps. Slowest: ${slowest.label}`}>
        {avg.map((s, i) => {
          if (s.ms <= 0) return null;
          const last = avg.slice(i + 1).every((n) => n.ms <= 0);
          return (
            <span key={s.key} className={`h-full rounded-[4px] ${last ? "rounded-r-[8px]" : ""}`}
                  style={{ width: `${(s.ms / total) * 100}%`, minWidth: 2, background: s.color }} />
          );
        })}
      </div>
      <ul className="mt-5 space-y-3.5">
        {avg.map((s) => (
          <li key={s.key} className="grid grid-cols-[1fr_auto] items-start gap-x-4">
            <div>
              <p className="flex items-center gap-2 text-[13px] font-medium">
                <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
                {s.label}
                {s.key === (slowest.key as StageKey) && (
                  <span className="rounded-full bg-ink/[0.08] px-2 py-0.5 text-[11px] font-medium text-ink">Slowest</span>
                )}
              </p>
              <p className="ml-[18px] mt-0.5 text-xs text-muted">{s.tech}</p>
            </div>
            <p className="num text-right text-[13px]">
              <span className="font-semibold">{fmtMs(s.ms)}</span>
              <span className="ml-2 text-muted">{Math.round((s.ms / total) * 100)}%</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
