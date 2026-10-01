export default function ProgressBar({ value, total, tone = 'brand' }) {
  const percent = (value / Math.max(1, total)) * 100;
  return (
    <div
      className="h-1.5 overflow-hidden rounded-pill bg-line"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
    >
      <div
        className={`h-full rounded-pill transition-all duration-500 ${tone === 'ok' ? 'bg-ok' : 'bg-brand-500'}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
