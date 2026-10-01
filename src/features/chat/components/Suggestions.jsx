/** Possible next steps under the latest reply only: outlined and quiet, a help rather than the main action. */
export default function Suggestions({ items, onPick }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pl-9" aria-label="Possibili passi successivi">
      {items.map((item, i) => (
        <button
          key={item}
          type="button"
          onClick={() => onPick(item)}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-ink transition hover:border-brand-300 hover:bg-brand-50/70"
          style={{ animation: 'var(--animate-fade-up)', animationDelay: `${i * 60}ms` }}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
