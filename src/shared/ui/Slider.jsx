/** Index of the stop closest to `value`: a saved value that is not on the list still lands somewhere. */
const nearestStop = (stops, value) =>
  stops.reduce(
    (best, stop, index) => (Math.abs(stop - value) < Math.abs(stops[best] - value) ? index : best),
    0
  );

/**
 * A range input that says in words what the current value means. With `stops` (sorted numbers) it
 * slides over that list instead of min..max, so a wide range (3 s to 10 min) stays precise at the low
 * end and quick to cross at the high end; `min`, `max` and `step` are then ignored.
 */
export default function Slider({ label, reading, min, max, step, stops, value, rangeLabels, onChange }) {
  const position = stops ? nearestStop(stops, value) : value;
  const low = stops ? 0 : min;
  const high = stops ? stops.length - 1 : max;
  const fill = `${((position - low) / (high - low)) * 100}%`;
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
        min={low}
        max={high}
        step={stops ? 1 : step}
        value={position}
        onChange={e => onChange(stops ? stops[Number(e.target.value)] : Number(e.target.value))}
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
