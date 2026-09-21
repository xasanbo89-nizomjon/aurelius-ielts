import type { QuestionType } from "@prisma/client";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

type Choice = { id: string; text: string };

function isChoiceArray(value: unknown): value is Choice[] {
  return (
    Array.isArray(value) &&
    value.every((v) => isRecord(v) && typeof v.id === "string" && typeof v.text === "string")
  );
}

function labelFor(choices: Choice[], id: string): string {
  return choices.find((choice) => choice.id === id)?.text ?? id;
}

const TRUE_FALSE_LABELS: Record<string, string> = { TRUE: "True", FALSE: "False", NOT_GIVEN: "Not Given" };

/** Renders a question's stored `correctAnswer` or a student's `response` as readable text for review screens. */
export function formatAnswerForDisplay(type: QuestionType, options: unknown, value: unknown): string {
  if (value == null) return "—";

  try {
    switch (type) {
      case "MULTIPLE_CHOICE": {
        if (!isStringArray(value) || value.length === 0) return "—";
        const choices = isRecord(options) && isChoiceArray(options.choices) ? options.choices : [];
        return value.map((id) => labelFor(choices, id)).join(", ");
      }

      case "TRUE_FALSE_NOT_GIVEN": {
        return typeof value === "string" ? (TRUE_FALSE_LABELS[value] ?? value) : "—";
      }

      case "MATCHING": {
        if (!isRecord(value)) return "—";
        const prompts = isRecord(options) && isChoiceArray(options.prompts) ? options.prompts : [];
        const matchOptions = isRecord(options) && isChoiceArray(options.options) ? options.options : [];
        const lines = Object.entries(value)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string")
          .map(([promptId, optionId]) => `${labelFor(prompts, promptId)} → ${labelFor(matchOptions, optionId)}`);
        return lines.join("; ") || "—";
      }

      case "SUMMARY_COMPLETION": {
        if (!isRecord(value)) return "—";
        const entries = Object.entries(value)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string")
          .sort(([a], [b]) => Number(a) - Number(b));
        return entries.map(([blank, text]) => `Blank ${blank}: ${text}`).join(", ") || "—";
      }

      default:
        return typeof value === "string" && value.trim() ? value : "—";
    }
  } catch {
    return "—";
  }
}
