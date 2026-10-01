/**
 * Drafts a table's index card with Gemini — same shape as document index cards
 * (`features/documents/indexing.js`): the model proposes it from the schema (and, opt-in, a few
 * sample rows), the admin reviews and edits before it ever reaches the chat's system instruction.
 */
'use client';

import { getModel } from '@/shared/firebase/ai';
import { withRetry } from '@/shared/retry';
import { getSettings } from '@/features/settings/settingsStore';

const CARD_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Una o due frasi: a cosa serve questa tabella, cosa rappresenta ogni riga.'
    },
    columns: {
      type: 'array',
      description: 'Una voce per ogni colonna il cui nome non basta a capire cosa contiene.',
      items: {
        type: 'object',
        properties: {
          column: { type: 'string', description: 'Il nome esatto della colonna.' },
          description: { type: 'string', description: 'Cosa contiene, in poche parole.' }
        },
        required: ['column', 'description']
      }
    }
  },
  required: ['summary', 'columns']
};

const DRAFT_INSTRUCTIONS = `Sei il bibliotecario di un database. Ti do il nome di una tabella, le sue colonne (nome, tipo,
eventuali valori ENUM, commenti) e, se disponibili, alcune righe di esempio.
Scrivi una scheda breve per un motore di ricerca interno: a cosa serve la tabella, e una descrizione
per ogni colonna il cui nome o tipo da solo non basta a capire cosa contiene (salta le colonne ovvie
come "id" o "created_at"). Usa solo quello che ti do, non inventare. Scrivi in italiano.
Rispondi esclusivamente con JSON conforme allo schema.`;

function describeColumn(column) {
  const bits = [column.name, column.columnType || column.dataType];
  if (column.key === 'PRI') bits.push('chiave primaria');
  if (column.comment) bits.push(`commento: ${column.comment}`);
  return bits.join(' · ');
}

function buildPrompt(table, sample) {
  const parts = [
    `Tabella: ${table.name}${table.comment ? ` (commento: ${table.comment})` : ''}`,
    `Colonne:\n${table.columns.map(c => `- ${describeColumn(c)}`).join('\n')}`
  ];
  if (table.foreignKeys?.length) {
    parts.push(
      `Riferimenti ad altre tabelle:\n${table.foreignKeys
        .map(fk => `- ${fk.column} → ${fk.referencedTable}.${fk.referencedColumn}`)
        .join('\n')}`
    );
  }
  if (sample?.rows?.length) {
    parts.push(`Righe di esempio (JSON):\n${JSON.stringify(sample.rows, null, 2)}`);
  }
  return parts.join('\n\n');
}

/** @returns {Promise<{summary: string, columns: Record<string,string>}>} */
export async function draftTableCard(table, sample) {
  const { indexingModel, chatModel } = await getSettings({ refresh: true });
  const model = getModel({
    model: indexingModel || chatModel,
    systemInstruction: DRAFT_INSTRUCTIONS,
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: CARD_SCHEMA }
  });

  const result = await withRetry(() => model.generateContent(buildPrompt(table, sample)));
  const parsed = JSON.parse(result.response.text());
  return {
    summary: parsed.summary || '',
    columns: Object.fromEntries((parsed.columns || []).map(c => [c.column, c.description]))
  };
}
