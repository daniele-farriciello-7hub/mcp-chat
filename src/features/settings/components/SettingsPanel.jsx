/**
 * Admin-only configuration panel. Changes go to Firestore and apply to everyone from the next
 * conversation. The Documents tab saves on its own, so it has no save bar — except its "Documenti senza AI" subsection,
 * whose lists are part of the shared settings. The Database tab is
 * mixed: connections and tables save on their own too, but the database instructions and query
 * limits inside it are part of this shared settings object — same "Salva" bar as every other tab.
 * Storico is mixed the same way: its three history settings use the bar, the data below is read-only.
 *
 * The open tab (`tab`) and subsection (`subsection`) belong to the page (ChatPanel), which changes them from the tabs below
 * or, from the sidebar (and, where it is a drawer, from the selector below the header): switching never
 * remounts the panel, so what has been typed and not yet saved is kept, across the subsections of a tab and across tabs
 * alike, and the one "Salva" saves all of it. Leaving with edits unsaved is the page's to confirm: this panel tells it
 * (`onDirtyChange`) and the page drops the edits by giving the panel a new `key`.
 * Beside the sidebar each tab shows only its chosen subsection (settingsSections.js) under a title and a line saying what it is;
 * without it each tab shows everything, as it always did.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DocumentsTab, {
  DOCUMENT_VIEW_OF_SUBSECTION,
  SUBSECTION_OF_DOCUMENT_VIEW
} from '@/features/documents/components/DocumentsTab';
import DatabaseTab from '@/features/database/components/DatabaseTab';
import HistoryTab from '@/features/history/components/HistoryTab';
import { DEFAULT_SETTINGS } from '@/features/settings/defaultSettings';
import { findSubsection, findTab } from '@/features/settings/settingsSections';
import { getSettings, saveSettings } from '@/features/settings/settingsStore';
import { noAiTargets } from '@/features/shortcuts/noAiTargets';
import { useSidebar } from '@/features/navigation/SidebarContext';
import { PageTitleContext } from '@/shared/ui/Section';
import ModelSettingsTab from './ModelSettingsTab';
import ResetToDefaults from './ResetToDefaults';
import SaveBar from './SaveBar';
import SectionSelect from './SectionSelect';
import SettingsHeader from './SettingsHeader';
import SettingsSkeleton from './SettingsSkeleton';
import SettingsTabs from './SettingsTabs';
import HubTab from './HubTab';
import ShortcutsTab from './ShortcutsTab';

// the one subsection of the Documents tab whose data is the shared settings object (settingsSections.js)
const NO_AI_DOCUMENTS_SUBSECTION = 'senza-ai';

export default function SettingsPanel({ tab = 'model', subsection, onTabChange, onClose, onDirtyChange }) {
  const [settings, setSettings] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [saveState, setSaveState] = useState(null);
  const scrollRef = useRef(null);
  // with the sidebar the tabs are its entries (and the selector below is its stand-in where it is a drawer): the header names the
  // subsection and the tabs show only that one; without it the strip of tabs does the choosing and the tabs show everything
  const inSidebar = useSidebar() !== null;
  const tabInfo = findTab(tab) ?? findTab('model');
  const activeTab = tabInfo.id;
  const subInfo = inSidebar ? findSubsection(tabInfo, subsection) : null;
  const activeSubsection = subInfo?.id;

  useEffect(() => {
    getSettings({ refresh: true }).then(loaded => {
      setSettings(loaded);
      setSavedSnapshot(JSON.stringify(loaded));
    });
  }, []);

  // every tab and subsection opens at its top, whoever changed it (the tabs below, the sidebar or the selector)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeTab, activeSubsection]);

  const hasUnsavedChanges = useMemo(
    () => Boolean(settings && savedSnapshot && JSON.stringify(settings) !== savedSnapshot),
    [settings, savedSnapshot]
  );

  // the page asks before it leaves with edits not saved; closing the page itself is the browser's to ask
  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
    return () => onDirtyChange?.(false);
  }, [hasUnsavedChanges, onDirtyChange]);
  useEffect(() => {
    if (!inSidebar || !hasUnsavedChanges) return undefined;
    const warn = event => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [inSidebar, hasUnsavedChanges]);

  const header = {
    eyebrow: subInfo ? tabInfo.name : undefined,
    title: inSidebar ? (subInfo?.title ?? subInfo?.name ?? tabInfo.name) : undefined,
    subtitle: subInfo?.description
  };

  if (!settings) {
    return (
      <div className="flex h-full flex-col bg-panel">
        <SettingsHeader onClose={onClose} {...header} />
        <SettingsSkeleton />
      </div>
    );
  }

  const update = (key, value) => {
    setSettings(current => ({ ...current, [key]: value }));
    setSaveState(null);
  };

  // The Documents tab saves the category list by itself, straight to Firestore. This panel's copy must follow,
  // in the edited settings and in the saved snapshot alike: otherwise the next "Salva" on another tab would
  // write the old list back, and the tab would look as if it had unsaved changes.
  const categoriesSaved = documentCategories => {
    setSettings(current => ({ ...current, documentCategories }));
    setSavedSnapshot(snapshot => JSON.stringify({ ...JSON.parse(snapshot), documentCategories }));
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
  // come from DEFAULT_SETTINGS in the first place. So is Documents' "Documenti senza AI": its lists are
  // part of the shared settings object, so that one subsection has the bar like the others.
  const savesItself = activeTab === 'documents' && activeSubsection !== NO_AI_DOCUMENTS_SUBSECTION;

  return (
    <div className="flex h-full flex-col bg-panel">
      <SettingsHeader onClose={onClose} hasUnsavedChanges={hasUnsavedChanges} {...header} />
      {inSidebar ? (
        <SectionSelect tab={activeTab} subsection={activeSubsection} onChange={onTabChange} />
      ) : (
        <SettingsTabs activeTab={activeTab} onChange={onTabChange} />
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <PageTitleContext value={inSidebar ? header.title : null}>
          {activeTab === 'model' && (
            <ModelSettingsTab settings={settings} onChange={update} subsection={activeSubsection} />
          )}
          {activeTab === 'shortcuts' && (
            <ShortcutsTab
              shortcuts={settings.shortcuts}
              targets={noAiTargets(settings)}
              onChange={value => update('shortcuts', value)}
              personalLimit={settings.personalShortcutsLimit}
              onPersonalLimitChange={value => update('personalShortcutsLimit', value)}
              subsection={activeSubsection}
            />
          )}
          {activeTab === 'documents' && (
            <DocumentsTab
              categories={settings.documentCategories}
              onCategoriesSaved={categoriesSaved}
              documentLists={settings.noAiDocumentLists}
              commands={settings.noAiCommands}
              onDocumentListsChange={value => update('noAiDocumentLists', value)}
              // beside the sidebar the subsections are the views; the same instance stays up while they change
              {...(inSidebar && {
                view: DOCUMENT_VIEW_OF_SUBSECTION[activeSubsection],
                onViewChange: view => onTabChange('documents', SUBSECTION_OF_DOCUMENT_VIEW[view])
              })}
            />
          )}
          {activeTab === 'database' && (
            <DatabaseTab
              settings={settings}
              onChange={update}
              hasUnsavedChanges={hasUnsavedChanges}
              subsection={activeSubsection}
            />
          )}
          {activeTab === 'history' && (
            <HistoryTab settings={settings} onChange={update} subsection={activeSubsection} />
          )}
          {activeTab === 'hub' && (
            <HubTab settings={settings} onChange={update} subsection={activeSubsection} />
          )}
        </PageTitleContext>

        {!savesItself && (
          <div className="mt-8 border-t border-line pt-4">
            <ResetToDefaults
              onReset={() => {
                // the category list is kept: the documents carry its names, and it is saved on its own (Documenti)
                setSettings(current => ({
                  ...DEFAULT_SETTINGS,
                  documentCategories: current.documentCategories
                }));
                setSaveState(null);
              }}
            />
          </div>
        )}
      </div>

      {!savesItself && (
        <SaveBar
          saveState={saveState}
          hasUnsavedChanges={hasUnsavedChanges}
          onSave={save}
          note={inSidebar ? 'Vale per tutti, dalla conversazione successiva.' : undefined}
        />
      )}
    </div>
  );
}
