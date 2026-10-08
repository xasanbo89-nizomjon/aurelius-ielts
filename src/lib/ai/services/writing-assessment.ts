import "server-only";
import OpenAI from "openai";

import { getOpenAIClient, getOpenAIModel } from "@/lib/ai/openai";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { recordMetric, recordAiTokenUsage } from "@/lib/monitoring/metrics-store";
import { buildSystemPrompt, buildUserPrompt, type PromptContext } from "@/lib/writing-assessment/prompt";
import { MODEL_JSON_SCHEMA, ReplyProblem, finishTask, modelReplySchema, type TaskReport } from "@/lib/writing-assessment/report";
import { writingCallCostMicro } from "@/lib/writing-assessment/cost";
import type { TaskKey } from "@/lib/writing-assessment/constants";

/**
 * Phase O - the AI call behind one Writing task: the model reads the task (and, for Task 1, LOOKS at the picture), marks the four criteria and writes the feedback.
 *
 *   - the model comes from OPENAI_WRITING_ASSESS_MODEL (unset: the app's OPENAI_MODEL, as every other AI feature), with a LOW temperature (0.2);
 *   - the reply must follow a JSON schema (structured outputs) AND pass the zod checks of report.ts AND every quoted mistake must be in the student's essay;
 *   - one retry: a reply that cannot be used is asked for again once, with the reason; a call that failed for a moment (network, rate limit) is tried once more too;
 *   - no call starts or waits past the `deadline`, so a serverless function is never cut off half way;
 *   - every call - including a failed one - is returned as a usage run (tokens, estimated cost) for the Root Teacher's usage page.
 */

export const WRITING_TEMPERATURE = 0.2;
const MAX_COMPLETION_TOKENS = 4000;
/** One call never waits longer than this, and not at all when less than MIN_CALL_MS of the budget is left. */
const MAX_CALL_MS = 70_000;
const MIN_CALL_MS = 8_000;

/** The model that marks Writing: its own variable, then the app's default. */
export const writingModel = (): string => process.env.OPENAI_WRITING_ASSESS_MODEL?.trim() || getOpenAIModel();

/** Just the part of the OpenAI client this uses, so a check can hand in its own. */
export type AiClientLike = { chat: { completions: { create: (params: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown> } } };

export type AiDeps = {
  client?: AiClientLike;
  /** Epoch ms after which no call is started or waited for. */
  deadline?: number;
  /** For a check: the pause before the retry. */
  retryDelayMs?: number;
};

export type UsageRun = { kind: string; model: string; promptTokens: number; completionTokens: number; costMicroUsd: number; ok: boolean; error: string | null; durationMs: number };

/** The model answered, but never in a form that could be used (twice). */
export class AssessmentFormatError extends Error {}

type Completion = { choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

export type AssessTaskInput = {
  context: PromptContext;
  submissionId: string;
  task: TaskKey;
  /** Task 1's picture as a data URL, or null when the task has none. */
  pictureDataUrl: string | null;
};

export type AssessTaskResult = { report: TaskReport; model: string; runs: UsageRun[] };

export async function assessTask(input: AssessTaskInput, deps: AiDeps = {}): Promise<AssessTaskResult> {
  const model = writingModel();
  const client = (deps.client ?? getOpenAIClient()) as AiClientLike;
  const deadline = deps.deadline ?? Date.now() + 100_000;
  const runs: UsageRun[] = [];
  const kind = input.task === "task1" ? "TASK_1" : "TASK_2";

  const system = buildSystemPrompt(input.context.task, input.context.trainingType);
  const baseUser = buildUserPrompt(input.context);
  const userContent = (text: string) =>
    input.pictureDataUrl
      ? [
          { type: "text", text },
          { type: "image_url", image_url: { url: input.pictureDataUrl, detail: "high" } },
        ]
      : text;

  let problem = "";
  let omitTemperature = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_CALL_MS) {
      throw new AIServiceUnavailableError(attempt === 1 ? "No time left to start the assessment." : "No time left for the second try.");
    }
    const label = attempt === 1 ? kind : `${kind}_RETRY`;
    // The second try says why the first reply was refused - unless there was no reply (the request itself failed).
    const text = attempt === 1 || problem === "the request failed" ? baseUser : `${baseUser}\n\nYour previous reply could not be used (${problem}). Reply again, following the schema exactly, and copy every quote letter for letter from the student's response.`;
    const began = performance.now();

    let completion: Completion;
    try {
      completion = (await client.chat.completions.create(
        {
          model,
          ...(omitTemperature ? {} : { temperature: WRITING_TEMPERATURE }),
          max_completion_tokens: MAX_COMPLETION_TOKENS,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent(text) },
          ],
          response_format: { type: "json_schema", json_schema: { name: "writing_task_assessment", strict: true, schema: MODEL_JSON_SCHEMA } },
        },
        { timeout: Math.min(MAX_CALL_MS, remaining - 1000) }
      )) as Completion;
    } catch (error) {
      const durationMs = Math.round(performance.now() - began);
      recordMetric("ai:writing_assessment", durationMs, false);
      runs.push({ kind: label, model, promptTokens: 0, completionTokens: 0, costMicroUsd: 0, ok: false, error: errorText(error), durationMs });
      // A model that does not take a temperature: ask again without it (this is not the "one retry").
      if (!omitTemperature && /temperature/i.test(errorText(error)) && /unsupported|not supported/i.test(errorText(error))) {
        omitTemperature = true;
        attempt--;
        continue;
      }
      if (attempt === 2) throw withRuns(new AIServiceUnavailableError(error instanceof OpenAI.APIError ? `OpenAI request failed: ${error.message}` : "OpenAI request failed.", { cause: error }), runs);
      problem = "the request failed";
      await new Promise((resolve) => setTimeout(resolve, deps.retryDelayMs ?? 1500));
      continue;
    }

    const durationMs = Math.round(performance.now() - began);
    const promptTokens = completion.usage?.prompt_tokens ?? 0;
    const completionTokens = completion.usage?.completion_tokens ?? 0;
    recordMetric("ai:writing_assessment", durationMs, true);
    if (completion.usage) recordAiTokenUsage("writing_assessment", promptTokens, completionTokens);
    const costMicroUsd = writingCallCostMicro(model, { promptTokens, completionTokens });

    try {
      const raw = completion.choices?.[0]?.message?.content;
      if (!raw) throw new ReplyProblem("the reply was empty");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new ReplyProblem("the reply was not valid JSON");
      }
      const checked = modelReplySchema.safeParse(parsed);
      if (!checked.success) {
        throw new ReplyProblem(`the reply broke the schema at ${checked.error.issues.slice(0, 3).map((issue) => issue.path.join(".") || "(root)").join(", ")}`);
      }
      const report = finishTask(checked.data, { task: input.task, submissionId: input.submissionId, essay: input.context.essay, wordCount: input.context.wordCount, usedPicture: input.task === "task1" ? input.pictureDataUrl != null : null });
      runs.push({ kind: label, model, promptTokens, completionTokens, costMicroUsd, ok: true, error: null, durationMs });
      return { report, model, runs };
    } catch (error) {
      if (!(error instanceof ReplyProblem)) throw error;
      runs.push({ kind: label, model, promptTokens, completionTokens, costMicroUsd, ok: false, error: error.message, durationMs });
      problem = error.message;
      if (attempt === 2) throw withRuns(new AssessmentFormatError(`The AI reply could not be used twice: ${problem}`), runs);
    }
  }
  throw withRuns(new AssessmentFormatError("The AI reply could not be used."), runs);
}

/** Carries the usage runs of a failed assessment out with the error, so the failed calls are still logged. */
function withRuns<T extends Error>(error: T, runs: UsageRun[]): T {
  (error as T & { runs?: UsageRun[] }).runs = runs;
  return error;
}

export const runsOfError = (error: unknown): UsageRun[] => ((error as { runs?: UsageRun[] } | null)?.runs ?? []);
