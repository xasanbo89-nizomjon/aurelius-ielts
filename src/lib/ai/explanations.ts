import "server-only";
import { createHash } from "crypto";
import type { QuestionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { formatAnswerForDisplay } from "@/lib/exam/format-answer";
import { generateExplanation } from "@/lib/ai/services/explain-more";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { getOpenAIModel } from "@/lib/ai/openai";
import type { ExplainMoreContext } from "@/lib/ai/prompts/explain-more";

export const DEFAULT_DAILY_EXPLANATION_LIMIT = 20;
/** Cap on how much passage/transcript text is sent per request — one section, not the whole test. */
const MAX_PASSAGE_CHARS = 6000;

export type AiExplanationContent = {
  whyCorrect: string;
  whyIncorrect: string;
  keywordEvidence: string;
  examStrategy: string;
  similarMistakeWarning: string;
};

export type ExplainMoreResult =
  | { success: true; explanation: AiExplanationContent; cached: boolean }
  | { success: false; code: "NOT_FOUND" | "NOT_INCORRECT" | "RATE_LIMITED" | "UNAVAILABLE"; error: string };

function toContent(row: {
  whyCorrectExplanation: string;
  whyIncorrectExplanation: string;
  keywordEvidence: string;
  examStrategy: string;
  similarMistakeWarning: string;
}): AiExplanationContent {
  return {
    whyCorrect: row.whyCorrectExplanation,
    whyIncorrect: row.whyIncorrectExplanation,
    keywordEvidence: row.keywordEvidence,
    examStrategy: row.examStrategy,
    similarMistakeWarning: row.similarMistakeWarning,
  };
}

/** Deterministic across key order, so the same answer always hashes the same way. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashResponse(response: unknown): string {
  return createHash("sha256").update(stableStringify(response)).digest("hex");
}

function formatOptionsForPrompt(type: QuestionType, options: unknown): string | null {
  if (!options || typeof options !== "object") return null;
  const record = options as Record<string, unknown>;

  if (type === "MULTIPLE_CHOICE" && Array.isArray(record.choices)) {
    return (record.choices as { id: string; text: string }[]).map((choice) => `${choice.id}: ${choice.text}`).join("\n");
  }

  if (type === "MATCHING") {
    const prompts = Array.isArray(record.prompts) ? (record.prompts as { id: string; text: string }[]) : [];
    const matchOptions = Array.isArray(record.options) ? (record.options as { id: string; text: string }[]) : [];
    const promptLines = prompts.map((p) => `${p.id}: ${p.text}`).join("\n");
    const optionLines = matchOptions.map((o) => `${o.id}: ${o.text}`).join("\n");
    return `Items:\n${promptLines}\n\nOptions to match:\n${optionLines}`;
  }

  return null;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function getDailyExplanationLimit(teacherId: string | null): Promise<number> {
  if (!teacherId) return DEFAULT_DAILY_EXPLANATION_LIMIT;
  const settings = await prisma.aiSettings.findUnique({ where: { teacherId } });
  return settings?.dailyExplanationLimit ?? DEFAULT_DAILY_EXPLANATION_LIMIT;
}

export async function setDailyExplanationLimit(teacherId: string, limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("Daily limit must be a whole number between 1 and 200.");
  }
  return prisma.aiSettings.upsert({
    where: { teacherId },
    create: { teacherId, dailyExplanationLimit: limit },
    update: { dailyExplanationLimit: limit },
  });
}

/**
 * Generates (or reuses a cached) explanation for one incorrect answer.
 * Scoped to the requesting student's own attempt throughout — never trusts
 * a bare questionId. Cache hits skip OpenAI entirely and don't count
 * against the daily quota; only fresh generations do.
 */
export async function requestExplanation(
  resultId: string,
  studentId: string,
  questionId: string
): Promise<ExplainMoreResult> {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: { not: null } },
    select: {
      mockTest: { select: { type: true } },
      student: { select: { teacherId: true } },
      answers: { where: { questionId }, select: { response: true, isCorrect: true } },
    },
  });
  if (!result) return { success: false, code: "NOT_FOUND", error: "Attempt not found." };

  const answer = result.answers[0];
  if (!answer || answer.isCorrect !== false) {
    return { success: false, code: "NOT_INCORRECT", error: "Explanations are only available for incorrect answers." };
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      type: true,
      prompt: true,
      options: true,
      correctAnswer: true,
      passage: { select: { title: true, content: true } },
    },
  });
  if (!question) return { success: false, code: "NOT_FOUND", error: "Question not found." };

  const responseHash = hashResponse(answer.response);

  const cached = await prisma.aiExplanation.findUnique({
    where: { questionId_responseHash: { questionId, responseHash } },
  });

  if (cached) {
    await prisma.aiExplanationRequest.create({
      data: { studentId, questionId, explanationId: cached.id, servedFromCache: true },
    });
    return { success: true, explanation: toContent(cached), cached: true };
  }

  const limit = await getDailyExplanationLimit(result.student.teacherId);
  const usedToday = await prisma.aiExplanationRequest.count({
    where: { studentId, servedFromCache: false, createdAt: { gte: startOfToday() } },
  });
  if (usedToday >= limit) {
    return {
      success: false,
      code: "RATE_LIMITED",
      error: `You've reached today's limit of ${limit} explanations. Try again tomorrow.`,
    };
  }

  const context: ExplainMoreContext = {
    skill: result.mockTest.type === "LISTENING" ? "LISTENING" : "READING",
    questionType: QUESTION_TYPE_META[question.type].label,
    questionPrompt: question.prompt,
    optionsText: formatOptionsForPrompt(question.type, question.options),
    passageTitle: question.passage?.title ?? null,
    passageText: question.passage?.content ? question.passage.content.slice(0, MAX_PASSAGE_CHARS) : null,
    correctAnswerText: formatAnswerForDisplay(question.type, question.options, question.correctAnswer),
    studentAnswerText: formatAnswerForDisplay(question.type, question.options, answer.response),
  };

  let generated;
  try {
    generated = await generateExplanation(context);
  } catch (error) {
    const reason = error instanceof AIServiceUnavailableError ? error.message : "Unknown error.";
    console.error("[ai] explain-more generation failed:", reason);
    return { success: false, code: "UNAVAILABLE", error: "Explanation temporarily unavailable." };
  }

  // A second identical request (e.g. a double-click) can race this one to
  // the unique (questionId, responseHash) constraint — fall back to the row
  // the other request just won, rather than surfacing a write conflict.
  let created;
  try {
    created = await prisma.aiExplanation.create({
      data: {
        questionId,
        responseHash,
        whyCorrectExplanation: generated.whyCorrect,
        whyIncorrectExplanation: generated.whyIncorrect,
        keywordEvidence: generated.keywordEvidence,
        examStrategy: generated.examStrategy,
        similarMistakeWarning: generated.similarMistakeWarning,
        model: getOpenAIModel(),
      },
    });
  } catch {
    const existing = await prisma.aiExplanation.findUnique({
      where: { questionId_responseHash: { questionId, responseHash } },
    });
    if (!existing) return { success: false, code: "UNAVAILABLE", error: "Explanation temporarily unavailable." };
    created = existing;
  }

  await prisma.aiExplanationRequest.create({
    data: { studentId, questionId, explanationId: created.id, servedFromCache: false },
  });

  return { success: true, explanation: toContent(created), cached: false };
}
