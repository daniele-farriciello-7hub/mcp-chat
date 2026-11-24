import { SETTINGS_TABS } from '@/features/settings/settingsSections';

/** The tab strip of the configuration panel, for a chat with no sidebar (the standalone page and /embed have it, and a selector where it is a drawer). */
export default function SettingsTabs({ activeTab, onChange, className = '' }) {
  return (
    // narrow (the 7AI panel in 7Hub is 400px): two rows of three, so every tab stays in sight
    <div className={`grid grid-cols-3 gap-1 border-b border-line px-3 pb-2.5 sm:flex ${className}`}>
      {SETTINGS_TABS.map(tab => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-fs-12 font-semibold transition ${
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
