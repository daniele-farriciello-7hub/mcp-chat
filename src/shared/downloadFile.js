/**
 * Saves the file at `url` on the user's computer under `fileName`.
 *
 * Firebase Storage download URLs are cross-origin, and on a cross-origin link the browser ignores
 * `<a download>`: it would show the file (or navigate away from the app) instead of saving it with its
 * own name. So the bytes are fetched and saved from a blob. If that fails (CORS, offline, a blocked
 * download) the URL is opened in a new tab instead, where the browser at least shows it or offers it.
 *
 * Resolves to 'saved' or 'opened', depending on which of the two happened.
 */
export async function downloadFile(url, fileName) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // the download starts on click; the URL is only released afterwards
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    return 'saved';
  } catch (error) {
    console.warn('[download] could not save the file, opening it instead:', error?.message || error);
    window.open(url, '_blank', 'noopener,noreferrer');
    return 'opened';
  }
}
