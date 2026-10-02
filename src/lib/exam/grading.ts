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

/** MATCHING and SUMMARY_COMPLETION store ONE row for what the IELTS paper numbers as several questions (one per prompt / blank). */
export function isGroupedQuestionType(type: QuestionType): boolean {
  return type === "MATCHING" || type === "SUMMARY_COMPLETION";
}

/**
 * Per-numbered-question grading for the grouped types: one entry per key of
 * the stored correct answer (a matching prompt id / a summary blank number),
 * correct only if the student gave a non-empty answer that matches. Every
 * other type is a single item. This is what lets a row that covers questions
 * 22–26 award marks per question instead of all-or-nothing, so the score is
 * always out of the same 40 the student sees.
 */
export function gradeItems(type: QuestionType, correctAnswer: unknown, response: unknown): { key: string | null; correct: boolean }[] {
  if (!isGroupedQuestionType(type)) return [{ key: null, correct: isAnswerCorrect(type, correctAnswer, response) }];
  if (!isRecord(correctAnswer)) return [];

  const given = isRecord(response) ? response : {};
  return Object.keys(correctAnswer).map((key) => {
    const answer = given[key];
    if (normalize(answer).length === 0) return { key, correct: false };
    return {
      key,
      correct: type === "MATCHING" ? normalize(answer) === normalize(correctAnswer[key]) : textMatches(correctAnswer[key], answer),
    };
  });
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

      case "MATCHING":
      case "SUMMARY_COMPLETION": {
        const items = gradeItems(type, correctAnswer, response);
        return items.length > 0 && items.every((item) => item.correct);
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

/**
 * Marks for a grouped row that isn't fully right: its points split evenly
 * across its numbered questions, rounded DOWN so a raw score is always a whole
 * number. An imported group carries exactly one point per number, so there it
 * is exactly "one mark per correct answer"; a hand-authored group worth fewer
 * points than it has items keeps its old all-or-nothing behavior.
 */
function partialPoints(question: { type: QuestionType; correctAnswer: unknown; points: number }, response: unknown): number {
  if (response === undefined || !isGroupedQuestionType(question.type)) return 0;
  const items = gradeItems(question.type, question.correctAnswer, response);
  if (items.length === 0) return 0;
  const correct = items.filter((item) => item.correct).length;
  return Math.floor((question.points * correct) / items.length);
}

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
      pointsAwarded: isCorrect ? question.points : partialPoints(question, response),
    };
  });
}
