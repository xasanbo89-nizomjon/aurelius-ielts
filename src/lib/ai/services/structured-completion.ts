import "server-only";
import OpenAI from "openai";
import type { z } from "zod";

import { getOpenAIClient, getOpenAIModel } from "@/lib/ai/openai";
import { AIServiceUnavailableError } from "@/lib/ai/errors";

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Shared "call OpenAI, get exactly one validated JSON shape back" primitive
 * behind every AI module — this is the reusable part of the architecture:
 * a new AI feature only needs its own prompt builder + JSON schema + zod
 * schema, not its own OpenAI call/parse/validate boilerplate.
 */
export async function createStructuredCompletion<T>({
  system,
  user,
  schemaName,
  jsonSchema,
  responseSchema,
  temperature = 0.3,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  responseSchema: z.ZodType<T>;
  temperature?: number;
  timeoutMs?: number;
}): Promise<T> {
  const client = getOpenAIClient();

  let completion;
  try {
    completion = await client.chat.completions.create(
      {
        model: getOpenAIModel(),
        temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, strict: true, schema: jsonSchema },
        },
      },
      { timeout: timeoutMs }
    );
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      throw new AIServiceUnavailableError(`OpenAI request failed: ${error.message}`, { cause: error });
    }
    throw new AIServiceUnavailableError("OpenAI request failed.", { cause: error });
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new AIServiceUnavailableError("OpenAI returned an empty response.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new AIServiceUnavailableError("OpenAI returned an invalid response.", { cause: error });
  }

  const result = responseSchema.safeParse(parsed);
  if (!result.success) {
    throw new AIServiceUnavailableError("OpenAI returned an unexpected response shape.");
  }

  return result.data;
}
