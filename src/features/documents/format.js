export const formatTimestamp = value => {
  const date = value?.toDate ? value.toDate() : null;
  return date
    ? date.toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
};

export const formatFileSize = bytes => {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`;
};
