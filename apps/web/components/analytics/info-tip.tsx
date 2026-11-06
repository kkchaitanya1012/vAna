import { Info } from "@phosphor-icons/react/dist/ssr";

/** Hover or focus tooltip. Plain-language explanation for every metric. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={text} className="rounded-full text-muted transition-colors hover:text-ink">
        <Info size={14} weight="bold" aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-xl border border-[var(--border-strong)] bg-[var(--raised)] px-3 py-2 text-xs font-normal leading-snug text-ink opacity-0 shadow-lg  transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
