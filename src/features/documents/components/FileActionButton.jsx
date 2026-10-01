import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { getDocumentUrl } from '@/features/documents/documentStore';
import Tooltip from '@/shared/ui/Tooltip';

/** Downloads the uploaded file. */
export default function FileActionButton({ document }) {
  const [opening, setOpening] = useState(false);
  const label = 'Scarica il file';

  const open = async event => {
    event.stopPropagation();
    setOpening(true);
    try {
      const url = await getDocumentUrl(document);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setOpening(false);
    }
  };

  return (
    <Tooltip label={label} align="right">
      <button
        type="button"
        onClick={open}
        aria-label={`${label}: ${document.name}`}
        className="shrink-0 rounded-lg p-1.5 text-slate-soft transition hover:bg-surface hover:text-brand-600"
      >
        {opening ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      </button>
    </Tooltip>
  );
}
