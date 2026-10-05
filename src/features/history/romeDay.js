/**
 * The calendar day in Rome as 'YYYY-MM-DD': a conversation lasts until the day changes there, not
 * at the operator's local midnight or UTC's. en-CA formats dates as ISO, which is why it is used.
 */
const FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export const romeDay = (date = new Date()) => FORMAT.format(date);
