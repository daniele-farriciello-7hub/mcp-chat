/**
 * Where Google Drive delivers push notifications (`driveWebhook`, public). Drive POSTs here, with the
 * details in `X-Goog-*` headers and no body, whenever a watched folder or file changes. There is no
 * user to authenticate: the channel's token, an HMAC only this project can make (drive/channels.js), is
 * what proves the call is Drive's, for one of our sources.
 *
 * A notification does no work itself: it marks the source due now, and the scheduler's next tick syncs it
 * (the sync can take minutes, far more than a webhook may). Whatever happens, Drive gets a quick answer; a
 * 5xx makes it retry with backoff, which is only wanted when our own storage failed.
 */
import { stopStrayChannel, verifyChannelToken } from '../drive/channels.js';
import { noteDriveChange } from '../drive/sourceStore.js';

export async function handleDriveWebhook(req, res) {
  if (req.method !== 'POST') return res.status(405).send('');

  const sourceId = verifyChannelToken(req.get('X-Goog-Channel-Token'));
  if (!sourceId) return res.status(403).send('');

  // the message Drive sends right after a channel is created: nothing has changed
  if (req.get('X-Goog-Resource-State') === 'sync') return res.status(200).send('');

  try {
    const outcome = await noteDriveChange(sourceId);
    if (outcome === 'missing') {
      // the source was removed but Drive still has the channel: end it so it stops calling
      await stopStrayChannel(req.get('X-Goog-Channel-ID'), req.get('X-Goog-Resource-ID')).catch(error =>
        console.warn('drive webhook: could not stop a stray channel:', error?.message || error)
      );
    }
    return res.status(200).send('');
  } catch (error) {
    console.error('drive webhook failed', error);
    return res.status(500).send('');
  }
}
