import "server-only";
import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-4o-mini";

let cachedClient: OpenAI | null = null;

/**
 * Lazily initializes the OpenAI client on first use, not at module load —
 * same reasoning as the Firebase Admin SDK (see src/lib/firebase/admin.ts):
 * importing this file must never crash a page that doesn't actually call
 * OpenAI just because OPENAI_API_KEY isn't set yet. Only an actual request
 * fails, with a clear error.
 */
export function getOpenAIClient(): OpenAI {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}
