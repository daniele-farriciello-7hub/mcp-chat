import { createElement } from 'react';
import { File, FileSpreadsheet, FileText, Image } from 'lucide-react';
import { fileTypeOf } from '@/features/documents/fileTypes';

const ICON_BY_FILE_TYPE = { gsheet: FileSpreadsheet, excel: FileSpreadsheet, image: Image, other: File };

export default function FileTypeIcon({ mimeType, ...props }) {
  return createElement(ICON_BY_FILE_TYPE[fileTypeOf(mimeType)] || FileText, props);
}
