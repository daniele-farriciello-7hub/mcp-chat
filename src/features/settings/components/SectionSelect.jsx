/**
 * The way around the configuration where the sidebar is a drawer behind the hamburger (a phone, the 400px panel in 7hub): one
 * native selector with every tab as a group and its subsections as the options (a tab without subsections is an option of its
 * own). It replaces the strip of tabs there, which could not also hold the subsections. Where the sidebar is docked it does it
 * and this is not drawn.
 */
'use client';

import { useSidebar } from '@/features/navigation/SidebarContext';
import { SETTINGS_TABS } from '@/features/settings/settingsSections';
import { INPUT_CLASS } from '@/shared/ui/formStyles';

const keyOf = (tab, subsection) => `${tab}/${subsection ?? ''}`;

export default function SectionSelect({ tab, subsection, onChange }) {
  const docked = Boolean(useSidebar()?.desktop);
  if (docked) return null;
  return (
    <div className="border-b border-line px-3 pb-2.5">
      <select
        value={keyOf(tab, subsection)}
        onChange={event => {
          const [nextTab, nextSubsection] = event.target.value.split('/');
          onChange(nextTab, nextSubsection || null);
        }}
        className={INPUT_CLASS}
        aria-label="Sezione della configurazione"
      >
        {SETTINGS_TABS.map(item =>
          item.subsections?.length ? (
            <optgroup key={item.id} label={item.name}>
              {item.subsections.map(sub => (
                <option key={sub.id} value={keyOf(item.id, sub.id)}>
                  {sub.name}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={item.id} value={keyOf(item.id)}>
              {item.name}
            </option>
          )
        )}
      </select>
    </div>
  );
}
