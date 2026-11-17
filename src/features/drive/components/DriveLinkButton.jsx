import { Cloud } from 'lucide-react';
import Tooltip from '@/shared/ui/Tooltip';

/**
 * Marks a document that comes from Google Drive and opens the file there. The folder it sits in
 * (`drivePath`) is in the tooltip.
 */
export default function DriveLinkButton({ document }) {
  const label = document.drivePath ? `Apri su Google Drive · ${document.drivePath}` : 'Apri su Google Drive';
  const icon = <Cloud size={14} />;

  if (!document.driveWebViewLink) {
    return (
      <Tooltip label="Arriva da Google Drive" align="right">
        <span className="shrink-0 p-1.5 text-slate-soft">{icon}</span>
      </Tooltip>
    );
  }
  return (
    <Tooltip label={label} align="right">
      <a
        href={document.driveWebViewLink}
        target="_blank"
        rel="noopener noreferrer"
        onClick={event => event.stopPropagation()}
        aria-label={`Apri ${document.name} su Google Drive`}
        className="shrink-0 rounded-lg p-1.5 text-slate-soft transition hover:bg-surface hover:text-brand-600"
      >
        {icon}
      </a>
    </Tooltip>
  );
}
