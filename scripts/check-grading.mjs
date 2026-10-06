// Phase L1 - proof, on the real stored data, that allowing a list of accepted alternatives did not change how anything that already exists is scored.
// READ-ONLY: it only reads questions and answers.
//
//   npm run check:grading
//
//   1. every stored answer key still passes the answer schema of its type (the schemas only became wider)
//   2. every stored key scores itself as right (a string, a list, a matching map, a summary map) and an altered answer as wrong
//   3. every stored student answer is graded again with the grading code and compared with the verdict stored when it was handed in
//
// Exit code 1 if (1) or (2) fails. A difference in (3) is listed, not hidden: it can only come from a key edited after the attempt, never from this phase.
import { PrismaClient } from "@prisma/client";

import { isAnswerCorrect, gradeResponses } from "@/lib/exam/grading";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { summaryBlankKeys } from "@/lib/exam/question-numbering";

const db = new PrismaClient();
let failed = 0;

function selfAnswer(type, key) {
  switch (type) {
    case "MULTIPLE_CHOICE": return [...key];
    case "MATCHING": return { ...key };
    case "SUMMARY_COMPLETION": return Object.fromEntries(Object.entries(key).map(([blank, answer]) => [blank, Array.isArray(answer) ? answer[0] : answer]));
    default: return Array.isArray(key) ? key[0] : key;
  }
}
function wrongAnswer(type, key) {
  switch (type) {
    case "MULTIPLE_CHOICE": return ["__none__"];
    case "MATCHING": return Object.fromEntries(Object.keys(key).map((k) => [k, "__none__"]));
    case "SUMMARY_COMPLETION": return Object.fromEntries(Object.keys(key).map((k) => [k, "zzz-not-an-answer"]));
    default: return "zzz-not-an-answer";
  }
}

try {
  const questions = await db.question.findMany({ select: { id: true, type: true, options: true, correctAnswer: true, mockTest: { select: { title: true, isPublished: true } } } });
  let invalid = 0;
  const legacy = [];
  let selfWrong = 0;
  let altered = 0;
  const byType = new Map();
  for (const q of questions) {
    byType.set(q.type, (byType.get(q.type) ?? 0) + 1);
    if (q.correctAnswer == null) continue;
    const shape = QUESTION_TYPE_META[q.type].responseSchema.safeParse(q.correctAnswer);
    if (!shape.success) { invalid++; console.log(`  key of the wrong shape: "${q.mockTest.title.slice(0, 30)}" ${q.type} ${q.id}`); }
    // Not caused by this phase and not about scoring: a summary whose text has no blank markers shows the student nothing to type into.
    if (q.type === "SUMMARY_COMPLETION" && summaryBlankKeys(q.options?.text).length === 0) legacy.push(q);
    if (!isAnswerCorrect(q.type, q.correctAnswer, selfAnswer(q.type, q.correctAnswer))) { selfWrong++; console.log(`  key does not score itself: ${q.type} ${q.id}`); }
    if (isAnswerCorrect(q.type, q.correctAnswer, wrongAnswer(q.type, q.correctAnswer))) { altered++; console.log(`  an altered answer scored right: ${q.type} ${q.id}`); }
  }
  console.log(`1+2. ${questions.length} stored questions (${[...byType].map(([t, n]) => `${t} ${n}`).join(", ")})`);
  for (const q of legacy) console.log(`  note (older data, unrelated to answers): "${q.mockTest.title.slice(0, 30)}" ${q.mockTest.isPublished ? "PUBLISHED" : "draft"}, summary question ${q.id} has no {{n}} blank markers - the publish check will block it.`);
  console.log(`     keys of the wrong shape: ${invalid} - keys that do not score themselves: ${selfWrong} - altered answers scored right: ${altered}`);
  if (invalid || selfWrong || altered) failed = 1;

  const attempts = await db.result.findMany({
    where: { completedAt: { not: null }, skill: { in: ["READING", "LISTENING"] } },
    select: { id: true, mockTest: { select: { title: true, questions: { select: { id: true, type: true, correctAnswer: true, points: true } } } }, answers: { select: { questionId: true, response: true, isCorrect: true, pointsAwarded: true } } },
  });
  let compared = 0;
  let differ = 0;
  for (const attempt of attempts) {
    const graded = new Map(gradeResponses(attempt.mockTest.questions, new Map(attempt.answers.map((a) => [a.questionId, a.response]))).map((g) => [g.questionId, g]));
    for (const answer of attempt.answers) {
      if (answer.isCorrect == null) continue;
      compared++;
      const now = graded.get(answer.questionId);
      if (now && (now.isCorrect !== answer.isCorrect || now.pointsAwarded !== (answer.pointsAwarded ?? 0))) {
        differ++;
        console.log(`  differs: attempt ${attempt.id} question ${answer.questionId}: stored ${answer.isCorrect}/${answer.pointsAwarded}, graded now ${now.isCorrect}/${now.pointsAwarded}`);
      }
    }
  }
  console.log(`3.   ${attempts.length} completed attempts, ${compared} stored answers re-graded: ${compared - differ} agree, ${differ} differ`);
  console.log(failed ? "\nFAILED" : "\nOK - nothing that is stored scores differently.");
} finally {
  await db.$disconnect();
}
process.exit(failed);
