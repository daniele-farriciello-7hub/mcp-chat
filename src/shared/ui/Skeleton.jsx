/**
 * Loading placeholders shaped like what is coming — a card list, a row of tiles, a conversation —
 * so the page keeps its layout while it loads instead of showing a lone spinner.
 */
const block = 'skeleton rounded-lg';

/** Cards with an icon, a title and a line under it (shortcuts, lists of items). */
export function SkeletonCards({ count = 3 }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-3">
          <span className="skeleton h-10 w-10 shrink-0 rounded-full" />
          <span className="flex flex-1 flex-col gap-2">
            <span className={`${block} h-3`} style={{ width: `${55 - i * 8}%` }} />
            <span className={`${block} h-2.5`} style={{ width: `${80 - i * 10}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** The Storico dashboard: tiles, then a chart. */
export function SkeletonDashboard() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl bg-surface px-3 py-2.5">
            <span className={`${block} h-2.5 w-2/3`} />
            <span className={`${block} h-5 w-1/3`} />
          </div>
        ))}
      </div>
      <div className="flex h-40 items-end gap-1 rounded-xl border border-line p-3.5">
        {[40, 65, 30, 80, 55, 70, 45, 90, 60, 35, 75, 50].map((h, i) => (
          <span key={i} className="skeleton flex-1 rounded-t-[4px]" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

/** A conversation: alternating question and answer bubbles. */
export function SkeletonConversation() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {[0, 1].map(i => (
        <div key={i} className="flex flex-col gap-3">
          <span className="skeleton ml-auto h-8 w-1/2 rounded-[18px]" />
          <div className="flex gap-2">
            <span className="skeleton h-7 w-7 shrink-0 rounded-[9px]" />
            <span className="flex flex-1 flex-col gap-2 pt-1">
              <span className={`${block} h-2.5 w-11/12`} />
              <span className={`${block} h-2.5 w-4/5`} />
              <span className={`${block} h-2.5 w-2/5`} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
