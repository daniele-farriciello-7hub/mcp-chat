const TRANSIENT_ERROR = /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|fetch-error/i;

export const isTransientError = error => TRANSIENT_ERROR.test(String(error?.message || error));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Runs `task`, retrying transient failures (overload, rate limit, 5xx) with exponential backoff. */
export async function withRetry(
  task,
  { attempts = 4, baseDelayMs = 2000, shouldRetry = isTransientError } = {}
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}
