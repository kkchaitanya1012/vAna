"use client";

import { useRef, useState } from "react";
import { fmtMs } from "@/lib/format";
import { STAGES, type StageValues } from "@/lib/stages";

export type ChartPoint = { idx: number; label: string; total: number; stages: StageValues };

const W = 720;
const H = 280;
const M = { l: 48, r: 18, t: 18, b: 34 };

function niceMax(v: number): number {
  const step = v > 4000 ? 1000 : 500;
  return Math.max(1000, Math.ceil((v * 1.12) / step) * step);
}

/** Monotone cubic through the points: smooth, and it never overshoots the data. */
function smooth(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]} ${pts[0][1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const t: number[] = new Array(n).fill(0);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  }
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    d += `C${x0 + dx[i] / 3} ${y0 + (t[i] * dx[i]) / 3} ${x1 - dx[i] / 3} ${y1 - (t[i + 1] * dx[i]) / 3} ${x1} ${y1}`;
  }
  return d;
}

export function InsightChart({
  points,
  p50,
  selected,
  onSelect,
}: {
  points: ChartPoint[];
  p50: number | null;
  selected: number | null;
  onSelect: (idx: number | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const top = niceMax(Math.max(...points.map((p) => p.total), 0));
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  // x follows the real turn number, so skipped turns show as gaps instead of looking evenly spaced
  const lo = points[0]?.idx ?? 0;
  const hi = points[points.length - 1]?.idx ?? 0;
  const x = (i: number) => (hi === lo ? M.l + iw / 2 : M.l + ((points[i].idx - lo) / (hi - lo)) * iw);
  const y = (v: number) => M.t + ih - (v / top) * ih;
  const xy = points.map((p, i) => [x(i), y(p.total)] as const);
  const line = smooth(xy);
  const area = xy.length > 1 ? `${line} L${xy[xy.length - 1][0]} ${M.t + ih} L${xy[0][0]} ${M.t + ih} Z` : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);

  function onMove(e: React.PointerEvent) {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const vx = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    xy.forEach(([px], i) => {
      if (Math.abs(px - vx) < Math.abs(xy[best][0] - vx)) best = i;
    });
    setHover(best);
  }

  const active = hover ?? (selected != null ? points.findIndex((p) => p.idx === selected) : -1);
  const ap = active >= 0 ? points[active] : null;
  const tipLeft = ap ? Math.min(Math.max((xy[active][0] / W) * 100, 16), 84) : 0;

  return (
    <div
      ref={box}
      className="relative"
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      onClick={() => hover != null && onSelect(points[hover].idx)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img"
           aria-label={`Response time for each of ${points.length} turns, typical ${fmtMs(p50)}`}>
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--text)" strokeOpacity="0.07" />
            <text x={M.l - 10} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--text-muted)" className="num">
              {t === 0 ? "0" : t >= 1000 ? `${t / 1000} s` : `${t} ms`}
            </text>
          </g>
        ))}

        {top >= 800 && (
          <g>
            <line x1={M.l} x2={W - M.r} y1={y(800)} y2={y(800)} stroke="var(--good)" strokeOpacity="0.55" strokeDasharray="4 5" />
            <text x={W - M.r} y={y(800) - 6} textAnchor="end" fontSize="12" fill="var(--good)">
              Feels natural below 0.8 s
            </text>
          </g>
        )}
        {p50 != null && p50 < top && (
          <line x1={M.l} x2={W - M.r} y1={y(p50)} y2={y(p50)} stroke="var(--text)" strokeOpacity="0.28" strokeDasharray="2 5" />
        )}

        {area && <path d={area} fill="url(#area-fill)" />}
        {points.length > 1 && (
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {ap && (
          <line x1={xy[active][0]} x2={xy[active][0]} y1={M.t} y2={M.t + ih} stroke="var(--text)" strokeOpacity="0.2" />
        )}

        {points.map((p, i) => {
          const on = i === active;
          return (
            <g key={p.idx}>
              <circle cx={xy[i][0]} cy={xy[i][1]} r={on ? 6 : 4} fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
              <text x={xy[i][0]} y={H - 12} textAnchor="middle" fontSize="12" fill={on ? "var(--text)" : "var(--text-muted)"} className="num">
                {p.idx}
              </text>
            </g>
          );
        })}
      </svg>

      {ap && (
        <div
          role="status"
          className="pointer-events-none absolute top-2 z-20 w-52 -translate-x-1/2 rounded-panel border border-[var(--border-strong)] bg-[var(--raised)] p-3 text-xs shadow-lg "
          style={{ left: `${tipLeft}%` }}
        >
          <div className="flex items-baseline justify-between">
            <span className="font-medium">{ap.label}</span>
            <span className="num text-sm font-semibold">{fmtMs(ap.total)}</span>
          </div>
          <ul className="mt-2 space-y-1">
            {STAGES.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-muted">
                  <span aria-hidden className="size-2 rounded-[2px]" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="num">{fmtMs(ap.stages[s.key])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
