/**
 * Admin-only configuration panel. Changes go to Firestore and apply to everyone from the next
 * conversation. The Documents tab saves on its own, so it has no save bar. The Database tab is
 * mixed: connections and tables save on their own too, but the database instructions and query
 * limits inside it are part of this shared settings object — same "Salva" bar as every other tab.
 * Storico is mixed the same way: its three history settings use the bar, the data below is read-only.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DocumentsTab from '@/features/documents/components/DocumentsTab';
import DatabaseTab from '@/features/database/components/DatabaseTab';
import HistoryTab from '@/features/history/components/HistoryTab';
import { DEFAULT_SETTINGS } from '@/features/settings/defaultSettings';
import { getSettings, saveSettings } from '@/features/settings/settingsStore';
import ModelSettingsTab from './ModelSettingsTab';
import ResetToDefaults from './ResetToDefaults';
import SaveBar from './SaveBar';
import SettingsHeader from './SettingsHeader';
import SettingsSkeleton from './SettingsSkeleton';
import SettingsTabs from './SettingsTabs';
import ShortcutsTab from './ShortcutsTab';

export default function SettingsPanel({ onClose }) {
  const [settings, setSettings] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [activeTab, setActiveTab] = useState('model');
  const [saveState, setSaveState] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    getSettings({ refresh: true }).then(loaded => {
      setSettings(loaded);
      setSavedSnapshot(JSON.stringify(loaded));
    });
  }, []);

  const hasUnsavedChanges = useMemo(
    () => Boolean(settings && savedSnapshot && JSON.stringify(settings) !== savedSnapshot),
    [settings, savedSnapshot]
  );

  if (!settings) {
    return (
      <div className="flex h-full flex-col bg-white">
        <SettingsHeader onClose={onClose} />
        <SettingsSkeleton />
      </div>
    );
  }

  const update = (key, value) => {
    setSettings(current => ({ ...current, [key]: value }));
    setSaveState(null);
  };

  const openTab = id => {
    setActiveTab(id);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const save = async () => {
    setSaveState('saving');
    try {
      await saveSettings(settings);
      setSavedSnapshot(JSON.stringify(settings));
      setSaveState('saved');
    } catch (error) {
      console.error('[settings] save failed:', error);
      setSaveState('failed');
    }
  };

  // Documents writes to Firestore as the admin interacts with it, with nothing from the shared
  // settings object on that tab: no save bar, no reset block. Database is mixed (see the comment
  // above) and keeps both — its connections/tables ignore the reset regardless, since they never
  // come from DEFAULT_SETTINGS in the first place.
  const savesItself = activeTab === 'documents';

  return (
    <div className="flex h-full flex-col bg-white">
      <SettingsHeader onClose={onClose} hasUnsavedChanges={hasUnsavedChanges} />
      <SettingsTabs activeTab={activeTab} onChange={openTab} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === 'model' && <ModelSettingsTab settings={settings} onChange={update} />}
        {activeTab === 'shortcuts' && (
          <ShortcutsTab
            shortcuts={settings.shortcuts}
            onChange={value => update('shortcuts', value)}
            personalLimit={settings.personalShortcutsLimit}
            onPersonalLimitChange={value => update('personalShortcutsLimit', value)}
          />
        )}
        {activeTab === 'documents' && <DocumentsTab />}
        {activeTab === 'database' && <DatabaseTab settings={settings} onChange={update} />}
        {activeTab === 'history' && <HistoryTab settings={settings} onChange={update} />}

        {!savesItself && (
          <div className="mt-8 border-t border-line pt-4">
            <ResetToDefaults
              onReset={() => {
                setSettings(DEFAULT_SETTINGS);
                setSaveState(null);
              }}
            />
          </div>
        )}
      </div>

      {!savesItself && <SaveBar saveState={saveState} hasUnsavedChanges={hasUnsavedChanges} onSave={save} />}
    </div>
  );
}
