import { createElement } from 'react';
import { Calculator, CircleHelp, FileText, FolderPlus, Search, WandSparkles } from 'lucide-react';

/** Icon id stored in settings → lucide component. Keys match SHORTCUT_ICONS. */
const ICON_COMPONENTS = {
  documents: FileText,
  search: Search,
  explain: WandSparkles,
  application: FolderPlus,
  calculator: Calculator,
  question: CircleHelp
};

export default function ShortcutIcon({ id, ...props }) {
  return createElement(ICON_COMPONENTS[id] || CircleHelp, props);
}
