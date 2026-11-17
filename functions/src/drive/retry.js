/**
 * Retries and parallel work for the Drive sync. `withRetry` does what src/shared/retry.js does in the
 * browser (transient failures — overload, rate limit, 5xx — retried with exponential backoff), plus
 * the network errors and Drive rate-limit answers a server meets.
 */
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const TRANSIENT_TEXT =
  /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|rateLimitExceeded|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed/i;

export const statusOf = error => Number(error?.status ?? error?.code ?? error?.response?.status) || 0;

export const isTransientError = error =>
  TRANSIENT_STATUS.has(statusOf(error)) || TRANSIENT_TEXT.test(String(error?.message || error));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Runs `task`, retrying transient failures; stops at once when `signal` has aborted (the run is out of time). */
export async function withRetry(task, { attempts = 4, baseDelayMs = 2000, signal } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= attempts || signal?.aborted || !isTransientError(error)) throw error;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

/**
 * Runs `worker` over `items`, at most `limit` at a time. Results come back in order; a worker that
 * throws makes the whole call reject, so workers that must not stop the others catch their own errors.
 */
export async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}
