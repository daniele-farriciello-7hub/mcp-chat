/**
 * A few mutually exclusive choices side by side, for a setting with a handful of named levels.
 * `options` is `[{ id, name }]`; the help line under it is the caller's, since it depends on the pick.
 */
export default function SegmentedControl({ options, value, onChange, ariaLabel }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex gap-0.5 rounded-xl border border-line bg-surface p-0.5"
    >
      {options.map(option => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={`flex-1 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition ${
              selected ? 'bg-white text-brand-600 shadow-soft' : 'text-slate-soft hover:text-ink'
            }`}
          >
            {option.name}
          </button>
        );
      })}
    </div>
  );
}
