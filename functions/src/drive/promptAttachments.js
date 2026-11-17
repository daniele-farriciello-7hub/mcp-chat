/**
 * Formats the admin's attached `.md` guides (`{name, content}[]`) for the indexing prompt.
 *
 * KEEP IN STEP WITH src/shared/promptAttachments.js (`attachmentsBlock`), used by the browser's
 * indexing prompt: the same guides must read the same way whichever side writes the card.
 */
export function attachmentsBlock(attachments) {
  if (!attachments?.length) return null;
  return attachments
    .map(a => `--- Guida allegata "${a.name}" ---\n${a.content}\n--- fine guida allegata ---`)
    .join('\n\n');
}
