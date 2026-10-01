/** Grey bars shaped like the real fields: it is obvious which panel is loading. */
export default function SettingsSkeleton() {
  const bar = 'animate-pulse rounded-lg bg-line';
  return (
    <div className="flex flex-col gap-6 px-4 py-4" aria-hidden>
      <div className="flex flex-col gap-2.5">
        <div className={`${bar} h-2.5 w-20`} />
        {[0, 1, 2].map(i => (
          <div key={i} className={`${bar} h-14 w-full`} />
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        <div className={`${bar} h-2.5 w-28`} />
        <div className={`${bar} h-2 w-32`} />
        <div className={`${bar} h-1.5 w-full`} />
        <div className={`${bar} h-2 w-24`} />
        <div className={`${bar} h-1.5 w-full`} />
      </div>
    </div>
  );
}
