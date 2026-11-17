const TRANSIENT_ERROR = /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|fetch-error/i;
const RATE_LIMIT_ERROR = /\b429\b|RESOURCE_EXHAUSTED|quota/i;

export const isTransientError = error => TRANSIENT_ERROR.test(String(error?.message || error));

/** A quota / rate-limit rejection (HTTP 429): it clears on its own, but more slowly than a plain 5xx. */
export const isRateLimitError = error =>
  error?.customErrorData?.status === 429 || RATE_LIMIT_ERROR.test(String(error?.message || error));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// shortened by up to a quarter at random, so clients that were limited together do not retry together
const withJitter = ms => ms * (0.75 + Math.random() * 0.25);

/**
 * Runs `task`, retrying transient failures (overload, rate limit, 5xx) with exponential backoff.
 *
 * `rateLimit` ({ attempts, maxDelayMs }) is for callers that want to wait a rate limit out for longer
 * than the other failures: a rate-limited call gets `rateLimit.attempts` tries instead of `attempts`,
 * with the same backoff capped at `maxDelayMs` and a little jitter. Without it every failure is
 * treated alike, as it always was.
 */
export async function withRetry(
  task,
  { attempts = 4, baseDelayMs = 2000, shouldRetry = isTransientError, rateLimit } = {}
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      const limited = Boolean(rateLimit) && isRateLimitError(error);
      if (attempt >= (limited ? rateLimit.attempts : attempts) || !shouldRetry(error)) throw error;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await sleep(limited ? withJitter(Math.min(delay, rateLimit.maxDelayMs)) : delay);
    }
  }
}
