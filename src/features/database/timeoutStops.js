/**
 * Stops of the timeout sliders (Database tab): fine steps while a query is short, wide ones past the
 * minute. The ceiling (600 s) is the server's own: QUERY_MAX_SECONDS and EXPORT_LIMITS in
 * functions/src/http/databaseEndpoint.js.
 */
export const TIMEOUT_STOPS = [
  3, 5, 10, 15, 20, 25, 30, 40, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300, 360, 420, 480, 540, 600
];
export const EXPORT_TIMEOUT_STOPS = TIMEOUT_STOPS.filter(seconds => seconds >= 10);

/** 45 → "45 s", 150 → "2 min 30 s", 600 → "10 min". */
export function formatSeconds(seconds) {
  if (seconds < 60) return `${seconds} s`;
  const rest = seconds % 60;
  return `${Math.floor(seconds / 60)} min${rest ? ` ${rest} s` : ''}`;
}
