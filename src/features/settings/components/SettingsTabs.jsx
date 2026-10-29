export const SETTINGS_TABS = [
  { id: 'model', name: 'Modello IA' },
  { id: 'shortcuts', name: 'Scorciatoie' },
  { id: 'documents', name: 'Documenti' },
  { id: 'database', name: 'Database' },
  { id: 'history', name: 'Storico' },
  { id: 'hub', name: '7Hub' }
];

export default function SettingsTabs({ activeTab, onChange }) {
  return (
    // narrow (the 7AI panel in 7Hub is 400px): two rows of three, so every tab stays in sight
    <div className="grid grid-cols-3 gap-1 border-b border-line px-3 pb-2.5 sm:flex">
      {SETTINGS_TABS.map(tab => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-[12px] font-semibold transition ${
              active ? 'bg-brand-50 text-brand-600' : 'text-slate-soft hover:bg-surface hover:text-ink'
            }`}
          >
            {tab.name}
          </button>
        );
      })}
    </div>
  );
}
