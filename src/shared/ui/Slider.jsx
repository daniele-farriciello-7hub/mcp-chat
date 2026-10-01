/** A range input that says in words what the current value means. */
export default function Slider({ label, reading, min, max, step, value, rangeLabels, onChange }) {
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-ink">{label}</span>
        <span className="rounded-pill bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-600">
          {reading}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        aria-label={label}
        style={{ '--range-fill': fill }}
        className="w-full"
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-slate-soft">
        <span>{rangeLabels[0]}</span>
        <span>{rangeLabels[1]}</span>
      </div>
    </div>
  );
}
