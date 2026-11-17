import { Cloud } from 'lucide-react';

export default function DocumentViewTabs({ activeView, onChange, totals }) {
  // the Drive view lists sources, not documents: it has no count
  const views = [
    { id: 'pending', name: 'Da indicizzare', count: totals.pending },
    { id: 'failed', name: 'Con errore', count: totals.failed, alert: totals.failed > 0 },
    { id: 'indexed', name: 'Indicizzati', count: totals.indexed },
    { id: 'drive', name: 'Drive', count: null, icon: Cloud, size: 'gap-1.5 text-[12.5px] leading-[16.5px]' }
  ];

  return (
    <div className="flex gap-1 rounded-xl bg-surface p-1" role="tablist">
      {views.map(view => {
        const active = activeView === view.id;
        return (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(view.id)}
            className={`flex min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-1 py-1.5 font-semibold transition ${
              view.size ?? 'gap-1 text-[11px]'
            } ${active ? 'bg-white text-ink shadow-soft' : 'text-slate-soft hover:text-ink'}`}
          >
            {view.icon && <view.icon size={14} className="shrink-0" />}
            <span className="truncate">{view.name}</span>
            {view.count !== null && (
              <span
                className={`rounded-pill px-1.5 text-[10px] font-semibold ${
                  view.alert ? 'bg-danger-soft text-danger' : 'text-slate-soft'
                }`}
              >
                {view.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
