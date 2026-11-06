import { CaretDown } from "@phosphor-icons/react/dist/ssr";

export function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative mt-2">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="field appearance-none pr-9">
          {children}
        </select>
        <CaretDown size={14} weight="bold" aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
