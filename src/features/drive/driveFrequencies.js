/**
 * How often a Drive source is synchronised, as the panel offers it. The ids are the ones the server
 * accepts (functions/src/drive/schedule.js): keep the two lists aligned.
 */
export const DRIVE_FREQUENCIES = [
  { id: 'every15min', name: 'Ogni 15 minuti' },
  { id: 'hourly', name: 'Ogni ora' },
  { id: 'every6h', name: 'Ogni 6 ore' },
  { id: 'daily', name: 'Ogni giorno' },
  { id: 'weekly', name: 'Ogni settimana' },
  { id: 'manual', name: 'Solo manuale' }
];

export const DEFAULT_FREQUENCY = 'hourly';
export const DEFAULT_DAILY_HOUR = 3;

/** Daily and weekly runs happen at a chosen hour of the day, Rome time (weekly: on Mondays). */
export const usesHour = frequency => frequency === 'daily' || frequency === 'weekly';

const pad = hour => String(hour).padStart(2, '0');
export const hourLabel = hour => `${pad(hour)}:00`;

/** "Ogni giorno alle 03:00", "Ogni lunedì alle 03:00", "Ogni ora"… */
export function describeFrequency({ frequency, dailyHour }) {
  if (frequency === 'daily') return `Ogni giorno alle ${hourLabel(dailyHour)}`;
  if (frequency === 'weekly') return `Ogni lunedì alle ${hourLabel(dailyHour)}`;
  return DRIVE_FREQUENCIES.find(f => f.id === frequency)?.name || frequency;
}
