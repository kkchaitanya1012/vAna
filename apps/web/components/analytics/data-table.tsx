import { fmtMs, turnLabel } from "@/lib/format";
import { STAGES, stageValues } from "@/lib/stages";
import type { TurnOut } from "@/lib/api";

/** Table view of the same numbers as the charts. */
export function DataTable({ turns }: { turns: TurnOut[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">Response time per turn, split by step</caption>
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-2 pr-4 font-medium">Turn</th>
            <th className="py-2 pr-4 font-medium">Response</th>
            {STAGES.map((s) => (
              <th key={s.key} className="py-2 pr-4 font-medium">{s.label}</th>
            ))}
            <th className="py-2 pr-4 font-medium">Tokens in/out</th>
          </tr>
        </thead>
        <tbody>
          {turns.map((t) => {
            const v = stageValues(t.stages);
            return (
              <tr key={t.idx} className="border-t border-line/60">
                <td className="py-2 pr-4">{turnLabel(t.idx, !!t.user_text)}</td>
                <td className="num py-2 pr-4 font-semibold">{fmtMs(t.stages.v2v)}</td>
                {STAGES.map((s) => (
                  <td key={s.key} className="num py-2 pr-4">{fmtMs(v[s.key])}</td>
                ))}
                <td className="num py-2 pr-4">{t.tokens_in ?? "n/a"} / {t.tokens_out ?? "n/a"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
