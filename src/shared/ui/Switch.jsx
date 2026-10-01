export default function Switch({ checked, onChange, label, description }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-line p-3">
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-ink">{label}</span>
        <span className="mt-1 block text-[11px] leading-snug text-slate-soft">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-pill transition ${checked ? 'bg-brand-500' : 'bg-line'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-pill bg-white shadow-soft transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}
