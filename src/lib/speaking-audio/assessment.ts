import { z } from "zod";

import { overallBand, toHalfBand, type CriterionBands } from "@/lib/speaking-audio/bands";
import type { FeedbackLanguage, SpeakingPart } from "@/lib/speaking-audio/constants";

/**
 * Phase Q-B - what the AI is asked to produce for one spoken answer, and how its reply is read back. Pure (no network, no database): the service that calls the
 * model lives in src/lib/ai/services/speaking-audio-assessment.ts and uses only these.
 *
 * The audio models do not accept a response schema, so the schema is written INTO the prompt and the reply is checked here with zod; a reply that does not parse
 * is asked for once more (see the service). The overall band is never taken from the model: it is the mean of the four criteria, rounded the IELTS way.
 */

const band = z.number().min(0).max(9);
const line = (max: number) => z.string().trim().min(1).max(max);

export const speakingAssessmentSchema = z.object({
  fluency: band,
  lexical: band,
  grammar: band,
  pronunciation: band,
  /** The model's own statement that it could not hear the recording and judged pronunciation from the transcript. */
  pronunciationEstimated: z.boolean().optional(),
  summary: line(1500),
  strengths: z.array(line(400)).min(1).max(6),
  mistakes: z
    .array(
      z.object({
        /** The student's own words, copied from the transcript. */
        quote: line(400),
        problem: line(400),
        correction: line(400),
      })
    )
    .max(8),
  vocabulary: z
    .array(
      z.object({
        /** What the student said or the idea they expressed. */
        instead_of: line(160),
        better: line(200),
        example: line(400),
      })
    )
    .max(8),
  sampleAnswer: z.string().trim().min(20).max(3000),
});
export type SpeakingAssessmentOutput = z.infer<typeof speakingAssessmentSchema>;

/** The checked, rounded assessment as it is stored. */
export type StoredAssessment = {
  summary: string;
  strengths: string[];
  mistakes: { quote: string; problem: string; correction: string }[];
  vocabulary: { insteadOf: string; better: string; example: string }[];
  sampleAnswer: string;
};

export type FinishedAssessment = { bands: CriterionBands; overall: number; pronunciationEstimated: boolean; stored: StoredAssessment };

const storedAssessmentSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  mistakes: z.array(z.object({ quote: z.string(), problem: z.string(), correction: z.string() })),
  vocabulary: z.array(z.object({ insteadOf: z.string(), better: z.string(), example: z.string() })),
  sampleAnswer: z.string(),
});

/** The assessment as it comes back out of the database (a JSON column), checked: null when it is missing or not in the stored shape. */
export function readStoredAssessment(value: unknown): StoredAssessment | null {
  const parsed = storedAssessmentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Half-band rounding of the four criteria, the overall band worked out here, and the text fields in their stored shape. */
export function finishAssessment(output: SpeakingAssessmentOutput, options: { pronunciationEstimated: boolean }): FinishedAssessment {
  const bands: CriterionBands = {
    fluency: toHalfBand(output.fluency),
    lexical: toHalfBand(output.lexical),
    grammar: toHalfBand(output.grammar),
    pronunciation: toHalfBand(output.pronunciation),
  };
  return {
    bands,
    overall: overallBand(bands),
    pronunciationEstimated: options.pronunciationEstimated || output.pronunciationEstimated === true,
    stored: {
      summary: output.summary,
      strengths: output.strengths,
      mistakes: output.mistakes,
      vocabulary: output.vocabulary.map((item) => ({ insteadOf: item.instead_of, better: item.better, example: item.example })),
      sampleAnswer: output.sampleAnswer,
    },
  };
}

/** The reply as text -> the checked output, or the reason it was not usable (a code fence or a sentence around the JSON is tolerated). */
export function parseAssessmentText(text: string): { ok: true; value: SpeakingAssessmentOutput } | { ok: false; error: string } {
  const raw = text.trim();
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "The reply holds no JSON object." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return { ok: false, error: "The reply is not valid JSON." };
  }
  const checked = speakingAssessmentSchema.safeParse(parsed);
  if (!checked.success) {
    const first = checked.error.issues[0];
    return { ok: false, error: `The reply does not match the schema at "${first?.path.join(".") || "(root)"}": ${first?.message ?? "invalid"}.` };
  }
  return { ok: true, value: checked.data };
}

/** The shape the model must answer in, written as an example (the audio models take no response schema). */
export const ASSESSMENT_JSON_EXAMPLE = `{
  "fluency": 6.5,
  "lexical": 6.0,
  "grammar": 6.0,
  "pronunciation": 6.5,
  "pronunciationEstimated": false,
  "summary": "2-4 sentences to the student about how this answer sounded and what to work on first (in the feedback language)",
  "strengths": ["one concrete strength, grounded in something the student really said or how they said it (in the feedback language)"],
  "mistakes": [{ "quote": "their words, copied exactly from the transcript", "problem": "what is wrong, briefly (in the feedback language)", "correction": "the corrected version of that sentence or phrase (English)" }],
  "vocabulary": [{ "instead_of": "a word or idea the student used", "better": "a stronger word or phrase", "example": "a short natural sentence using it" }],
  "sampleAnswer": "a model answer to the same question, about one band higher than the student's overall band"
}`;

const DESCRIPTORS = `Public IELTS Speaking band descriptors, in short:
- Fluency & Coherence. 4: frequent pauses and repetition, simple ideas, links with basic connectors. 5: keeps going but with noticeable hesitation, repetition and self-correction; overuses some connectors. 6: willing to speak at length, some hesitation and repetition, coherence mostly clear, uses a range of connectives though not always appropriately. 7: speaks at length without noticeable effort, some hesitation mainly to find the right words, uses a range of connectives and discourse markers flexibly. 8: fluent, hesitation is rare and content-related, develops topics coherently and appropriately. 9: fluent with only very rare repetition or self-correction.
- Lexical Resource. 4: basic vocabulary for familiar topics, frequent word-choice errors. 5: manages familiar and unfamiliar topics with limited flexibility, attempts paraphrase with mixed success. 6: wide enough to discuss topics at length, some inappropriate choices, paraphrases generally successfully. 7: flexible vocabulary, some less common and idiomatic items with awareness of style and collocation, some inaccuracy. 8: wide, precise vocabulary, skilful use of uncommon and idiomatic items, occasional slips. 9: total flexibility and precise use in all topics.
- Grammatical Range & Accuracy. 4: basic sentence forms, short utterances, frequent errors that cause misunderstanding. 5: basic forms fairly well controlled, limited complex structures with frequent errors. 6: a mix of short and complex forms, errors frequent in complex structures but rarely stop communication. 7: a range of complex structures with some flexibility, frequent error-free sentences, some persistent errors. 8: wide range of structures used flexibly, the majority of sentences error-free. 9: full flexibility and accurate use, only rare slips.
- Pronunciation (judged from the AUDIO). 4: some acceptable features but limited control, frequently mispronounces and causes difficulty for the listener. 5: shows the features of band 4 and some of band 6; mispronunciation sometimes causes difficulty. 6: uses a range of features with mixed control, can generally be understood throughout though mispronunciation sometimes reduces clarity. 7: shows all the positive features of band 6 and some of band 8; easily understood throughout, accent has minimal effect on intelligibility. 8: wide range of features with sustained flexible use, occasional lapses in accuracy, easily understood. 9: full range used with precision and subtlety, effortless to understand.`;

export type AssessmentContext = {
  part: SpeakingPart;
  /** The question asked, or the cue card's topic line. */
  question: string;
  /** Part 2: the "You should say" points. */
  cueCardPoints: string[];
  /** Part 2: what the student wrote in the preparation minute. */
  notes: string | null;
  transcript: string;
  durationSeconds: number;
  language: FeedbackLanguage;
  /** True when the recording itself is attached to the request (false = the transcript is all there is: Pronunciation must be an estimate). */
  hasAudio: boolean;
};

const SAMPLE_LENGTH: Record<SpeakingPart, string> = {
  1: "about 40-70 words",
  2: "about 150-220 words, in the spoken style of a two-minute talk",
  3: "about 80-130 words",
};

/** The examiner prompt: the descriptors, the rules, the language, and the JSON the reply must be. */
export function buildAssessmentPrompt(context: AssessmentContext): { system: string; user: string } {
  const language = context.language === "uz" ? "Uzbek (Latin script, O'zbek tili)" : "English";
  const system = `You are an experienced IELTS Speaking examiner marking ONE practice answer for a student. ${
    context.hasAudio
      ? "You are given the recording itself and a transcript made by a speech-to-text tool. The transcript may contain small errors; the AUDIO is your evidence for fluency, pronunciation, intonation, rhythm, speed, pauses and hesitation."
      : "You are given only a transcript made by a speech-to-text tool: you cannot hear the student. Judge Pronunciation indirectly (word choice, hesitation and repetition markers) and set \"pronunciationEstimated\" to true."
  }

${DESCRIPTORS}

Rules:
- Bands are in half steps from 0 to 9. Judge only what is in THIS answer. A very short answer gives little evidence for range: do not reward length for its own sake, but do not give a high band for range that was not shown.
- Fluency & Coherence: speed, pauses, self-correction, repetition, discourse markers and how well the ideas connect - judged from the audio.
- Pronunciation: individual sounds, word and sentence stress, intonation and rhythm; an accent matters only as far as it affects being understood.
- "mistakes": at most 6, the most important first (fewer, or none, if there are few). Each "quote" is the student's own words COPIED EXACTLY from the transcript; never invent a quote. Give the corrected version in "correction". For a pronunciation problem you can hear, use the mispronounced word as the "quote" and say in "correction" how to say it (the stressed syllable or the sound that is wrong) - never repeat the same word as the correction.
- "vocabulary": at most 5 useful upgrades for what the student said or wanted to say, each with a short natural example sentence.
- "sampleAnswer": a model answer to the SAME question about ONE band above the student's overall band, natural spoken English, ${SAMPLE_LENGTH[context.part]}.
- "summary": 2-4 sentences addressed to the student ("you"). Write "summary", "strengths" and every "problem" in ${language}. Everything the student could say aloud ("quote", "correction", "instead_of", "better", "example", "sampleAnswer") stays in English.
- Be constructive and specific. This is a practice estimate, not an official score.

Reply with ONE JSON object and nothing else: no markdown, no code fence, no comments. Exactly these keys and types:
${ASSESSMENT_JSON_EXAMPLE}`;

  const lines = [`IELTS Speaking Part ${context.part}.`, `Question: ${context.question}`];
  if (context.cueCardPoints.length > 0) lines.push(`You should say:\n${context.cueCardPoints.map((point) => `- ${point}`).join("\n")}`);
  if (context.notes && context.notes.trim()) lines.push(`The student's preparation notes (Part 2): ${context.notes.trim()}`);
  lines.push(`Recording length: ${Math.round(context.durationSeconds)} seconds.`);
  lines.push(`Transcript (speech-to-text):\n"""\n${context.transcript.trim()}\n"""`);
  lines.push(
    context.language === "uz"
      ? 'Feedback language: UZBEK (Latin script). "summary", "strengths" and every "problem" must be written in Uzbek - NOT in English. Only the English phrases the student could say aloud stay in English.'
      : 'Feedback language: English. "summary", "strengths" and every "problem" are written in English.'
  );
  lines.push(context.hasAudio ? "Listen to the attached recording and mark it now." : "Mark it now from the transcript.");
  return { system, user: lines.join("\n\n") };
}

/** A reminder sent with the second attempt, naming what was wrong with the first reply. */
export function retryInstruction(error: string): string {
  return `Your previous reply could not be used: ${error} Reply again with ONE valid JSON object with exactly the required keys and nothing else.`;
}
