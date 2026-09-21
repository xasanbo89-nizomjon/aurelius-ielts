/**
 * Any failure to produce a usable AI result — timeout, OpenAI rate limit, or
 * a malformed response. Shared by every AI module (Explain More, Study
 * Coach, and whatever comes next) so callers only need one error type to
 * catch and map to a friendly "temporarily unavailable" message.
 */
export class AIServiceUnavailableError extends Error {}
