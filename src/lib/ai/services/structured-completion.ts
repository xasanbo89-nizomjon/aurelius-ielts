import "server-only";
import OpenAI from "openai";
import type { z } from "zod";

import { getOpenAIClient, getOpenAIModel } from "@/lib/ai/openai";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { recordMetric, recordAiTokenUsage } from "@/lib/monitoring/metrics-store";
import { logServerError } from "@/lib/error-logger";

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
  model,
  onUsage,
}: {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  responseSchema: z.ZodType<T>;
  temperature?: number;
  timeoutMs?: number;
  /** Phase M2 - a model other than the app's default (OPENAI_MODEL) for this one feature; unset = the default, as every other caller. */
  model?: string;
  /** Phase M2 - told how many tokens the call used (and with which model), for a feature that keeps its own usage log. */
  onUsage?: (usage: { model: string; promptTokens: number; completionTokens: number }) => void;
}): Promise<T> {
  const client = getOpenAIClient();
  const modelName = model?.trim() || getOpenAIModel();
  const start = performance.now();

  let completion;
  try {
    completion = await client.chat.completions.create(
      {
        model: modelName,
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
    recordMetric(`ai:${schemaName}`, performance.now() - start, false);
    logServerError(`ai:${schemaName}`, error);
    if (error instanceof OpenAI.APIError) {
      throw new AIServiceUnavailableError(`OpenAI request failed: ${error.message}`, { cause: error });
    }
    throw new AIServiceUnavailableError("OpenAI request failed.", { cause: error });
  }

  recordMetric(`ai:${schemaName}`, performance.now() - start, true);
  if (completion.usage) {
    recordAiTokenUsage(schemaName, completion.usage.prompt_tokens, completion.usage.completion_tokens);
    onUsage?.({ model: modelName, promptTokens: completion.usage.prompt_tokens, completionTokens: completion.usage.completion_tokens });
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
    // Which fields were wrong (paths and rules only — never the model's text), so a recurring shape problem can be diagnosed from the log.
    console.error("[ai] response failed validation:", result.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.code}`).join("; "));
    throw new AIServiceUnavailableError("OpenAI returned an unexpected response shape.");
  }

  return result.data;
}
