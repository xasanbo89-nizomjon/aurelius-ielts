import { z } from "zod";

/**
 * The comprehensive "Word Details AI Panel" (Phase 12.3, section 1) —
 * everything shown when a student opens a saved word for the first time,
 * generated in a single OpenAI call and cached permanently on
 * VocabularyWord. Folds in section 3 (extra example sentences), section 4
 * (synonyms/opposites/related words) and section 5/6 (word family,
 * pronunciation) too, since generating all of it together costs one
 * request instead of five.
 */
export const wordIntelligenceResponseSchema = z.object({
  uzbekTranslation: z.string().min(1),
  englishDefinition: z.string().min(1),
  exampleSentence: z.string().min(1),
  synonyms: z.array(z.string().min(1)).min(1).max(8),
  /** Genuinely empty for a word with no natural opposite — never a forced/invented one. */
  opposites: z.array(z.string().min(1)).max(8),
  relatedWords: z.array(z.string().min(1)).min(1).max(8),
  wordFamily: z.array(z.object({ form: z.string().min(1), word: z.string().min(1) })).max(6),
  ipaPronunciation: z.string().min(1),
  stressPattern: z.string().min(1),
  simpleExamples: z.array(z.string().min(1)).length(3),
  ieltsExamples: z.array(z.string().min(1)).length(2),
  ieltsDifficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
});
export type WordIntelligenceResponse = z.infer<typeof wordIntelligenceResponseSchema>;

export const WORD_INTELLIGENCE_JSON_SCHEMA = {
  type: "object",
  properties: {
    uzbekTranslation: { type: "string", description: "The single best Uzbek translation of the word." },
    englishDefinition: { type: "string", description: "A clear, student-friendly English definition, one or two sentences." },
    exampleSentence: { type: "string", description: "One natural example sentence using the word." },
    synonyms: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 8,
      description: "REQUIRED: at least 3 and up to 8 real synonyms, closest meaning first. Nearly every English word has at least 3 near-synonyms or close paraphrases — do not leave this empty or under 3 items.",
    },
    opposites: {
      type: "array",
      items: { type: "string" },
      maxItems: 8,
      description: "Real opposites/antonyms if the word genuinely has any; an empty array if it doesn't — never invent one.",
    },
    relatedWords: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 8,
      description: "REQUIRED: at least 3 and up to 8 related/associated vocabulary useful for IELTS Writing on the same topic. Do not leave this empty or under 3 items.",
    },
    wordFamily: {
      type: "array",
      items: {
        type: "object",
        properties: {
          form: { type: "string", description: "The part of speech, e.g. 'noun', 'verb', 'adjective', 'adverb'." },
          word: { type: "string", description: "The word form itself, e.g. 'achievement'." },
        },
        required: ["form", "word"],
        additionalProperties: false,
      },
      maxItems: 6,
      description: "Up to 6 real word-family members (noun/verb/adjective/adverb forms) that actually exist for this word.",
    },
    ipaPronunciation: { type: "string", description: "IPA transcription, e.g. /əˈtʃiːv/." },
    stressPattern: { type: "string", description: "A short description of which syllable is stressed, e.g. 'Stress on the 2nd syllable: a-CHIEVE'." },
    simpleExamples: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 3,
      description: "REQUIRED: exactly 3 simple, everyday example sentences, each meaningfully different from the others.",
    },
    ieltsExamples: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 2,
      description: "REQUIRED: exactly 2 IELTS-register example sentences (Writing Task 2 style), each meaningfully different from the others and from simpleExamples.",
    },
    ieltsDifficulty: { type: "string", enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"], description: "How difficult this word is for an IELTS candidate." },
  },
  required: [
    "uzbekTranslation",
    "englishDefinition",
    "exampleSentence",
    "synonyms",
    "opposites",
    "relatedWords",
    "wordFamily",
    "ipaPronunciation",
    "stressPattern",
    "simpleExamples",
    "ieltsExamples",
    "ieltsDifficulty",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an IELTS vocabulary expert building a reference entry for one English word, for a student whose first language is Uzbek.
Rules:
- synonyms and relatedWords are REQUIRED fields — provide at least 3 real items in each, even for a simple word (use close paraphrases if exact synonyms are scarce). Only "opposites" may legitimately be an empty array, when the word genuinely has no natural opposite — never invent one just to fill it.
- Never invent a synonym, opposite, or word-family form that doesn't actually exist.
- All 5 example sentences (3 simple + 2 IELTS) must be meaningfully different from each other in structure and context — never trivial rewordings of the same sentence.
- Keep the English definition short and clear enough for an intermediate learner.
- Respond only through the structured fields you are given; do not add extra commentary.`;

export function buildWordIntelligencePrompt(word: string): { system: string; user: string } {
  return {
    system: SYSTEM_PROMPT,
    user: `Build a complete vocabulary reference entry for the English word: "${word}"`,
  };
}
