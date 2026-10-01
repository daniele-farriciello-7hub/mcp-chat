/**
 * Formats attached `.md` files (`{name, content}[]`) for inclusion in a prompt sent to the model.
 * Shared because two very different prompts use it: the chat's system instruction
 * (`features/chat/systemPrompt.js`) and the document-indexing prompt (`features/documents/indexing.js`).
 * Both inline each file's full text, never a summary, under its own filename header — see
 * `PromptAttachments.jsx` for why: a file that guides *how* the model answers or drafts a card has
 * to apply before it produces anything, so fetching it on demand would be too late.
 */
export function attachmentsBlock(attachments) {
  if (!attachments?.length) return null;
  return attachments
    .map(a => `--- Guida allegata "${a.name}" ---\n${a.content}\n--- fine guida allegata ---`)
    .join('\n\n');
}
