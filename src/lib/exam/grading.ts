import type { QuestionType } from "@prisma/client";

/**
 * Whether a stored/in-progress response counts as an actual answer (vs an
 * empty string, empty array, or an object with only blank values — which
 * can happen if a student typed something then cleared it). Shared between
 * the exam runner's live "answered" count and server-side result summaries
 * so both agree on what "skipped" means.
 */
export function isResponseAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.values(value).some((v) => typeof v === "string" && v.trim().length > 0);
  }
  return true;
}

/** Trim, lowercase, and collapse whitespace so minor formatting never costs a mark. */
function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textMatches(correct: unknown, given: unknown): boolean {
  const acceptable = Array.isArray(correct) ? correct : [correct];
  const normalizedGiven = normalize(given);
  return acceptable.some((candidate) => normalize(candidate) === normalizedGiven);
}

/**
 * Pure, deterministic grading — no DB access. Given a question's stored
 * `correctAnswer` and a student's submitted `response` (both untyped Json),
 * returns whether the response is fully correct.
 *
 * Unknown/malformed data is graded as incorrect rather than throwing, so a
 * single bad row can never crash the whole submission.
 */
export function isAnswerCorrect(type: QuestionType, correctAnswer: unknown, response: unknown): boolean {
  if (correctAnswer == null || response == null) return false;

  try {
    switch (type) {
      case "MULTIPLE_CHOICE": {
        if (!isStringArray(correctAnswer) || !isStringArray(response)) return false;
        if (correctAnswer.length === 0 || response.length !== correctAnswer.length) return false;
        const correctSet = new Set(correctAnswer);
        return response.every((choiceId) => correctSet.has(choiceId));
      }

      case "TRUE_FALSE_NOT_GIVEN": {
        return normalize(correctAnswer) === normalize(response) && normalize(response).length > 0;
      }

      case "MATCHING": {
        if (!isRecord(correctAnswer) || !isRecord(response)) return false;
        const keys = Object.keys(correctAnswer);
        if (keys.length === 0) return false;
        return keys.every((key) => normalize(response[key]) === normalize(correctAnswer[key]));
      }

      case "SUMMARY_COMPLETION": {
        if (!isRecord(correctAnswer) || !isRecord(response)) return false;
        const keys = Object.keys(correctAnswer);
        if (keys.length === 0) return false;
        return keys.every((key) => textMatches(correctAnswer[key], response[key]));
      }

      case "SENTENCE_COMPLETION":
      case "FILL_IN_BLANK":
      case "SHORT_ANSWER": {
        if (typeof response !== "string" || response.trim().length === 0) return false;
        return textMatches(correctAnswer, response);
      }

      default:
        return false;
    }
  } catch {
    return false;
  }
}

export type GradedAnswer = {
  questionId: string;
  isCorrect: boolean;
  pointsAwarded: number;
};

export function gradeResponses(
  questions: { id: string; type: QuestionType; correctAnswer: unknown; points: number }[],
  responses: Map<string, unknown>
): GradedAnswer[] {
  return questions.map((question) => {
    const response = responses.get(question.id);
    const isCorrect = response !== undefined && isAnswerCorrect(question.type, question.correctAnswer, response);
    return {
      questionId: question.id,
      isCorrect,
      pointsAwarded: isCorrect ? question.points : 0,
    };
  });
}
