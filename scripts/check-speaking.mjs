// Phase Q-B - the rules of the Speaking practice with an AI assessment, with no database and no network.
//
//   npm run check:speaking
//
//   bands       the overall band is the mean of the four criteria, rounded the IELTS way; half bands
//   assessment  the model's reply is read back and checked; the examiner prompt; the overall band is never the model's
//   cost        an estimate from the usage the API reports
//   recording   the WAV the audio model accepts (16 kHz mono 16-bit), the size limits
//   limits      the daily limit
import assert from "node:assert/strict";

import { averageBand, ieltsRound, overallBand, toHalfBand } from "@/lib/speaking-audio/bands";
import { buildAssessmentPrompt, finishAssessment, parseAssessmentText } from "@/lib/speaking-audio/assessment";
import { assessmentCostUsd, formatUsd, fromMicroUsd, toMicroUsd, transcriptionCostUsd } from "@/lib/speaking-audio/cost";
import { encodeWavPcm16, mixToMono, peakLevel, readWavInfo, resample } from "@/lib/speaking-audio/wav";
import { dailyAllowance, dailyLimitMessage, effectiveDailyLimit, monthRange, nextDayStart, startOfDay, zonedMidnight } from "@/lib/speaking-audio/limits";
import { DEFAULT_DAILY_SPEAKING_PRACTICES, MAX_RECORDING_BYTES, MAX_RECORDING_SECONDS, RECORDING_SAMPLE_RATE } from "@/lib/speaking-audio/constants";
import { describeMicError, micUnavailableReason, platformOf } from "@/lib/speaking-audio/mic-errors";
import { STALE_PENDING_SECONDS, canRetry, failureMessage, needsWorker, pollDelayMs, waitText } from "@/lib/speaking-audio/status";
import { changeText, criterionAverages, summarise, trendPoints } from "@/lib/speaking-audio/progress";
import { checkStartInput, parseCuePoints } from "@/lib/speaking-audio/input";
import { agoText, bandText, clock, dateText, dateTimeText, sizeText, snippet, untilText } from "@/lib/speaking-audio/format";
import { englishShare, languageReason, writtenInEnglish } from "@/lib/speaking-audio/language";

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log("ok   ", name);
  } catch (error) {
    failed++;
    console.log("FAIL ", name, "\n     ", String(error?.stack ?? error).split("\n").slice(0, 6).join("\n      "));
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------- B speaking
await check("B2 the overall band is the mean of the four criteria, rounded the IELTS way (.25 up to .5, .75 up to the next band)", () => {
  const overall = (f, l, g, p) => overallBand({ fluency: f, lexical: l, grammar: g, pronunciation: p });
  assert.equal(overall(6, 6, 6, 6), 6);
  assert.equal(overall(6, 6, 6, 6.5), 6, "mean 6.125 is under .25 above 6, so it rounds DOWN to 6.0");
  assert.equal(overall(7, 6, 6, 6), 6.5, "mean 6.25 -> 6.5");
  assert.equal(overall(7, 7, 6, 6), 6.5, "mean 6.5 stays");
  assert.equal(overall(7, 7, 7, 6), 7, "mean 6.75 -> 7.0");
  assert.equal(overall(5.5, 5.5, 5.5, 6), 5.5, "mean 5.625 -> 5.5");
  assert.equal(overall(9, 9, 9, 9), 9);
  assert.equal(overall(0, 0, 0, 0), 0);
  assert.equal(ieltsRound(6.125), 6);
  assert.equal(ieltsRound(6.249), 6);
  assert.equal(ieltsRound(6.25), 6.5);
  assert.equal(ieltsRound(6.74), 6.5);
  assert.equal(ieltsRound(6.75), 7);
  assert.equal(ieltsRound(8.9), 9);
  assert.equal(toHalfBand(6.3), 6.5);
  assert.equal(toHalfBand(6.2), 6);
  assert.equal(toHalfBand(11), 9);
  assert.equal(toHalfBand(-2), 0);
  assert.equal(toHalfBand(Number.NaN), 0);
  assert.equal(averageBand([6, 7, null, undefined, 6.5]), 6.5);
  assert.equal(averageBand([]), null);
});

const GOOD_REPLY = {
  fluency: 6.5,
  lexical: 6,
  grammar: 6.2,
  pronunciation: 7,
  summary: "You spoke clearly and kept going.",
  strengths: ["A clear opening sentence"],
  mistakes: [{ quote: "In my city have many people", problem: "Missing subject", correction: "In my city there are many people" }],
  vocabulary: [{ instead_of: "big", better: "sprawling", example: "It is a sprawling city." }],
  sampleAnswer: "I come from Tashkent, which is the capital of Uzbekistan and a very lively place to live.",
};

await check("B2 the model's reply is read back: a code fence or a sentence around the JSON is tolerated, a wrong shape is refused with the reason", () => {
  const plain = parseAssessmentText(JSON.stringify(GOOD_REPLY));
  assert.equal(plain.ok, true);
  const fenced = parseAssessmentText("Here is the result:\n```json\n" + JSON.stringify(GOOD_REPLY, null, 2) + "\n```");
  assert.equal(fenced.ok, true);
  assert.equal(parseAssessmentText("not json at all").ok, false);
  const missing = parseAssessmentText(JSON.stringify({ ...GOOD_REPLY, strengths: [] }));
  assert.equal(missing.ok, false);
  assert.match(missing.error, /strengths/);
  const outOfRange = parseAssessmentText(JSON.stringify({ ...GOOD_REPLY, fluency: 11 }));
  assert.equal(outOfRange.ok, false);
  assert.match(outOfRange.error, /fluency/);
  const none = parseAssessmentText(JSON.stringify({ ...GOOD_REPLY, mistakes: [] }));
  assert.equal(none.ok, true, "a perfect answer has no mistakes to list");
});

await check("B2 the bands are rounded to half bands and the overall is worked out here, never taken from the model", () => {
  const parsed = parseAssessmentText(JSON.stringify({ ...GOOD_REPLY, overall: 9 }));
  assert.equal(parsed.ok, true);
  const finished = finishAssessment(parsed.value, { pronunciationEstimated: false });
  assert.deepEqual(finished.bands, { fluency: 6.5, lexical: 6, grammar: 6, pronunciation: 7 });
  assert.equal(finished.overall, 6.5, "mean 6.375 -> 6.5; the 'overall: 9' the model slipped in is ignored");
  assert.equal(finished.pronunciationEstimated, false);
  assert.deepEqual(finished.stored.vocabulary, [{ insteadOf: "big", better: "sprawling", example: "It is a sprawling city." }]);
  assert.equal(finishAssessment(parsed.value, { pronunciationEstimated: true }).pronunciationEstimated, true, "no audio -> Pronunciation is an estimate from the transcript");
});

await check("B2 the examiner prompt carries the question, the cue card, the notes, the language and the rules; without audio it says Pronunciation is an estimate", () => {
  const base = { part: 2, question: "Describe a place you like.", cueCardPoints: ["where it is", "why you like it"], notes: "park, quiet", transcript: "I like a park near my house.", durationSeconds: 75.4, language: "en", hasAudio: true };
  const withAudio = buildAssessmentPrompt(base);
  assert.match(withAudio.system, /the AUDIO is your evidence/);
  assert.match(withAudio.system, /Fluency & Coherence/);
  assert.match(withAudio.system, /Pronunciation \(judged from the AUDIO\)/);
  assert.match(withAudio.system, /Write "summary", "strengths" and every "problem" in English/);
  assert.match(withAudio.system, /about 150-220 words/, "a Part 2 model answer is a two-minute talk");
  assert.match(withAudio.system, /"sampleAnswer"/);
  assert.match(withAudio.system, /use the mispronounced word as the "quote" and say in "correction" how to say it/, "a pronunciation problem is quoted as the word and corrected by how to say it");
  assert.match(withAudio.user, /Part 2/);
  assert.match(withAudio.user, /- where it is/);
  assert.match(withAudio.user, /preparation notes \(Part 2\): park, quiet/);
  assert.match(withAudio.user, /Recording length: 75 seconds/);
  assert.match(withAudio.user, /I like a park near my house\./);
  const uz = buildAssessmentPrompt({ ...base, part: 1, language: "uz" });
  assert.match(uz.system, /in Uzbek \(Latin script/);
  assert.match(uz.system, /about 40-70 words/);
  const noAudio = buildAssessmentPrompt({ ...base, hasAudio: false });
  assert.match(noAudio.system, /you cannot hear the student/);
  assert.match(noAudio.system, /"pronunciationEstimated" to true/);
});

await check("B3 an assessment's cost is an estimate from the usage the API reported (tokens, audio seconds), kept as whole millionths of a dollar", () => {
  const usage = { promptTokens: 1000, audioInputTokens: 700, completionTokens: 600 };
  const mini = assessmentCostUsd("gpt-audio-mini", usage);
  assert.ok(Math.abs(mini - (300 * 0.6 + 700 * 10 + 600 * 2.4) / 1e6) < 1e-12, String(mini));
  assert.ok(assessmentCostUsd("gpt-audio", usage) > mini, "the bigger model costs more");
  assert.equal(assessmentCostUsd("gpt-audio-mini", { promptTokens: 0, audioInputTokens: 0, completionTokens: 0 }), 0);
  assert.ok(Math.abs(transcriptionCostUsd("gpt-4o-mini-transcribe", 120) - 0.006) < 1e-12, "2 minutes at $0.003 a minute");
  assert.equal(toMicroUsd(0.0123456), 12346);
  assert.equal(fromMicroUsd(12346), 0.012346);
  assert.equal(formatUsd(0.04219), "$0.042");
  assert.equal(formatUsd(12.3), "$12.30");
});

await check("B1 the recording is turned into a WAV the audio model accepts: 16 kHz mono 16-bit, 32 KB a second, 2 minutes under 4 MB", () => {
  const sampleRate = 16000;
  const samples = new Float32Array(sampleRate * 2).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5);
  const wav = encodeWavPcm16(samples, sampleRate);
  assert.equal(wav.length, 44 + samples.length * 2);
  const info = readWavInfo(wav);
  assert.deepEqual([info.sampleRate, info.samples, Math.round(info.seconds * 100) / 100], [16000, 32000, 2]);
  assert.equal(readWavInfo(new Uint8Array(100)), null, "not a WAV");
  assert.ok(44 + MAX_RECORDING_SECONDS * RECORDING_SAMPLE_RATE * 2 < 4 * 1024 * 1024, "two minutes fit well under the 6 MB limit");
  assert.ok(MAX_RECORDING_BYTES > 44 + MAX_RECORDING_SECONDS * RECORDING_SAMPLE_RATE * 2);
  const mono = mixToMono([new Float32Array([1, 0, -1]), new Float32Array([0, 1, -1])]);
  assert.deepEqual([...mono], [0.5, 0.5, -1]);
  const down = resample(new Float32Array(48000).fill(0.25), 48000, 16000);
  assert.equal(down.length, 16000);
  assert.equal(down[100], 0.25);
  assert.ok(Math.abs(peakLevel(new Float32Array([0.1, -0.7, 0.3])) - 0.7) < 1e-6);
  assert.equal(peakLevel(new Float32Array(10)), 0);
});

await check("B3 the daily limit: the default when nothing is set, bounded when set, 'remaining' never negative", () => {
  assert.equal(effectiveDailyLimit(null), DEFAULT_DAILY_SPEAKING_PRACTICES);
  assert.equal(effectiveDailyLimit(0), 1);
  assert.equal(effectiveDailyLimit(7.9), 7);
  assert.equal(effectiveDailyLimit(10_000), 100);
  assert.deepEqual(dailyAllowance(5, 3), { limit: 5, used: 3, remaining: 2, allowed: true });
  assert.deepEqual(dailyAllowance(5, 5), { limit: 5, used: 5, remaining: 0, allowed: false });
  assert.equal(dailyAllowance(5, 9).remaining, 0);
  assert.match(dailyLimitMessage(5), /all 5 of today's/);
});

await check("B3 'today' is the students' calendar day (Asia/Tashkent, UTC+5), whatever zone the server runs in; months likewise", () => {
  const iso = (date) => date.toISOString();
  assert.equal(iso(startOfDay(new Date("2026-10-07T15:30:00Z"))), "2026-10-06T19:00:00.000Z", "20:30 on 7 Oct in Tashkent: the day began at 00:00 Tashkent = 19:00 UTC the evening before");
  assert.equal(iso(startOfDay(new Date("2026-10-07T20:30:00Z"))), "2026-10-07T19:00:00.000Z", "01:30 on 8 Oct in Tashkent: a server in UTC still says 7 Oct, the students' day has already turned");
  assert.equal(iso(nextDayStart(new Date("2026-10-07T15:30:00Z"))), "2026-10-07T19:00:00.000Z", "the limit comes back at midnight Tashkent time");
  assert.equal(iso(nextDayStart(new Date("2026-12-31T10:00:00Z"))), "2026-12-31T19:00:00.000Z", "over a year end");
  const october = monthRange(2026, 10);
  assert.deepEqual([iso(october.start), iso(october.end)], ["2026-09-30T19:00:00.000Z", "2026-10-31T19:00:00.000Z"]);
  assert.equal(iso(monthRange(2026, 12).end), "2026-12-31T19:00:00.000Z", "December ends where January begins");
  assert.equal(iso(zonedMidnight("America/New_York", 2026, 1, 15)), "2026-01-15T05:00:00.000Z", "winter time");
  assert.equal(iso(zonedMidnight("America/New_York", 2026, 7, 15)), "2026-07-15T04:00:00.000Z", "summer time");
});

await check("B1 downsampling a microphone's 48 kHz to 16 kHz filters the highest frequencies instead of folding them back into the speech band", () => {
  const rate = 48000;
  const rms = (values) => Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
  const tone = (hz) => new Float32Array(rate).map((_, i) => Math.sin((2 * Math.PI * hz * i) / rate));
  const speech = resample(tone(1000), rate, 16000);
  assert.ok(Math.abs(rms(speech) - rms(tone(1000))) < 0.05, "a 1 kHz tone passes almost untouched");
  const hiss = resample(tone(10000), rate, 16000);
  assert.ok(rms(hiss) < 0.75 * rms(tone(10000)), "a 10 kHz tone (an 's') is attenuated, not aliased at full strength: " + rms(hiss));
  assert.equal(resample(new Float32Array(44100).fill(0.5), 44100, 16000).length, 16000, "44.1 kHz works too");
});

await check("B1 the microphone's errors become plain messages with steps for the student's browser (Safari / iOS included)", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
  const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  assert.equal(platformOf(iphone), "ios");
  assert.equal(platformOf(mac), "mac-safari");
  assert.equal(platformOf(chrome), "chrome");
  assert.equal(platformOf("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36"), "android");
  const denied = describeMicError({ name: "NotAllowedError" }, iphone);
  assert.equal(denied.code, "denied");
  assert.match(denied.steps.join(" "), /Settings > Safari > Microphone/);
  assert.match(describeMicError({ name: "NotAllowedError" }, mac).steps.join(" "), /Safari > Settings > Websites > Microphone/);
  assert.match(describeMicError({ name: "NotAllowedError" }, chrome).steps.join(" "), /lock icon/);
  assert.equal(describeMicError({ name: "NotFoundError" }, chrome).code, "no-device");
  assert.equal(describeMicError({ name: "NotReadableError" }, chrome).code, "busy");
  assert.equal(describeMicError({ name: "InsecureContextError" }, chrome).code, "insecure");
  assert.equal(describeMicError(new Error("boom"), chrome).code, "unknown");
  assert.equal(describeMicError(null, "").code, "unknown");
  assert.equal(micUnavailableReason({ isSecureContext: false, hasGetUserMedia: true, hasAudioContext: true }), "insecure");
  assert.equal(micUnavailableReason({ isSecureContext: true, hasGetUserMedia: false, hasAudioContext: true }), "unsupported");
  assert.equal(micUnavailableReason({ isSecureContext: true, hasGetUserMedia: true, hasAudioContext: true }), null);
});

await check("B3 a practice's life: lost PENDING and PROCESSING whose lease ran out are picked up again; a failed one is retried only when the recording is not the problem", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const ago = (seconds) => new Date(now.getTime() - seconds * 1000);
  const row = (status, updated, started = null, attempts = 1) => ({ status, updatedAt: ago(updated), processingStartedAt: started == null ? null : ago(started), attempts });
  assert.equal(needsWorker(row("PENDING", 5), now), false, "just handed over");
  assert.equal(needsWorker(row("PENDING", STALE_PENDING_SECONDS + 1), now), true, "nobody started it");
  assert.equal(needsWorker(row("PROCESSING", 10, 10), now), false, "a worker is on it");
  assert.equal(needsWorker(row("PROCESSING", 400, 400), now), true, "the lease ran out: the worker died");
  assert.equal(needsWorker(row("DONE", 9999), now), false);
  assert.equal(needsWorker(row("FAILED", 9999), now), false);
  assert.equal(needsWorker(row("AWAITING_UPLOAD", 9999), now), false);
  assert.equal(canRetry("FAILED", "AI_UNAVAILABLE"), true);
  assert.equal(canRetry("FAILED", "BAD_FORMAT"), true);
  assert.equal(canRetry("FAILED", "INTERRUPTED"), true);
  assert.equal(canRetry("FAILED", "NO_SPEECH"), false, "silence has to be recorded again");
  assert.equal(canRetry("FAILED", "AUDIO_MISSING"), false);
  assert.equal(canRetry("FAILED", null), true, "an unknown reason can be tried again");
  assert.equal(canRetry("DONE", null), false);
  assert.equal(canRetry("PENDING", null), false);

  assert.match(failureMessage("NO_SPEECH"), /record again/i);
  assert.equal(failureMessage("???", "stored text"), "stored text");
  assert.equal(pollDelayMs(1000), 2000);
  assert.equal(pollDelayMs(60_000), 4000);
  assert.equal(pollDelayMs(300_000), 8000);
  assert.equal(waitText(42_000), "42 s");
  assert.equal(waitText(65_000), "1 min 05 s");
});

await check("B4 progress: the trend is the assessed practices in time order, the averages are of the stored bands, 'weakest' needs two practices", () => {
  const at = (day) => new Date(`2026-10-0${day}T10:00:00Z`);
  const p = (id, day, overall, f, l, g, pr, part = 1) => ({ id, at: at(day), part, overall, fluency: f, lexical: l, grammar: g, pronunciation: pr });
  const rows = [p("c", 3, 7, 7, 7, 7, 7), p("a", 1, 5.5, 5, 6, 5.5, 5.5), p("pending", 4, null, null, null, null, null), p("b", 2, 6, 6, 6, 6, 6)];
  assert.deepEqual(trendPoints(rows).map((x) => x.id), ["a", "b", "c"], "oldest first; the unassessed one is not in the trend");
  assert.deepEqual(trendPoints(rows, 2).map((x) => x.id), ["b", "c"], "the last two");
  const averages = criterionAverages(rows);
  assert.deepEqual(averages.map((x) => [x.key, x.average, x.count]), [["fluency", 6, 3], ["lexical", 6.3, 3], ["grammar", 6.2, 3], ["pronunciation", 6.2, 3]]);
  const summary = summarise(rows);
  assert.deepEqual([summary.count, summary.latest, summary.best, summary.average, summary.change], [3, 7, 7, 6.2, 1]);
  assert.equal(summary.weakest.key, "fluency");
  const one = summarise([p("x", 1, 6, 6, 6, 6, 6)]);
  assert.deepEqual([one.count, one.latest, one.change, one.weakest], [1, 6, null, null]);
  const none = summarise([]);
  assert.deepEqual([none.count, none.latest, none.best, none.average], [0, null, null, null]);
  assert.equal(changeText(0.5), "+0.5");
  assert.equal(changeText(-1), "-1.0");
  assert.equal(changeText(0), "no change");
  assert.equal(changeText(null), null);
});

await check("B1 what a student sends is checked the same way in the browser and on the server: the question, the cue card, the length, the size", () => {
  assert.deepEqual(parseCuePoints("- where it is\n* who you go with\n1. why you like it\n\n  • what you do there"), ["where it is", "who you go with", "why you like it", "what you do there"]);
  assert.equal(parseCuePoints(Array.from({ length: 10 }, (_, i) => `point ${i}`).join("\n")).length, 6);
  const good = { part: 2, source: "OWN", question: "  Describe   a place you like.\n\n\n\nWhy?  ", cueCardPoints: ["where it is", "  ", "why"], notes: "park  and  river", feedbackLanguage: "uz", durationSeconds: 75.46, bytes: 2_400_000 };
  const ok = checkStartInput(good);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.question, "Describe a place you like.\n\nWhy?");
  assert.deepEqual(ok.value.cueCardPoints, ["where it is", "why"]);
  assert.equal(ok.value.notes, "park and river");
  assert.equal(ok.value.durationSeconds, 75.5);
  assert.equal(ok.value.feedbackLanguage, "uz");
  const part1 = checkStartInput({ ...good, part: 1 });
  assert.deepEqual([part1.value.cueCardPoints, part1.value.notes], [[], null], "cue card and notes belong to Part 2 only");
  const topic = checkStartInput({ ...good, source: "TOPIC", topicId: "t1", questionId: "q1" });
  assert.deepEqual([topic.value.topicId, topic.value.questionId], ["t1", "q1"]);
  assert.deepEqual([ok.value.topicId, ok.value.questionId], [null, null], "an own question carries no topic");
  assert.match(checkStartInput({ ...good, durationSeconds: 2 }).error, /at least 5 seconds/);
  assert.equal(checkStartInput({ ...good, durationSeconds: MAX_RECORDING_SECONDS + 10 }).ok, false);
  assert.equal(checkStartInput({ ...good, bytes: MAX_RECORDING_BYTES + 1 }).ok, false);
  assert.match(checkStartInput({ ...good, question: "Hi" }).error, /question/i);
  assert.equal(checkStartInput({ ...good, part: 4 }).ok, false);
  assert.equal(checkStartInput({ ...good, feedbackLanguage: "fr" }).ok, false);
  assert.equal(checkStartInput(null).ok, false);

});

await check("B1 the small text formatters of the screens: clock, size, band, dates in Tashkent time, 'ago', 'in', a shortened question", () => {
  assert.equal(clock(125), "2:05");
  assert.equal(clock(59.9), "0:59");
  assert.equal(clock(-3), "0:00");
  assert.equal(clock(Number.NaN), "0:00");
  assert.equal(sizeText(3_932_204), "3.8 MB");
  assert.equal(sizeText(20_480), "20 KB");
  assert.equal(sizeText(0), "0 KB");
  assert.equal(bandText(6), "6.0");
  assert.equal(bandText(6.5), "6.5");
  assert.equal(bandText(null), "-");
  assert.equal(dateText("2026-10-07T20:30:00Z"), "8 Oct 2026", "20:30 UTC is already the next day in Tashkent");
  assert.match(dateTimeText("2026-10-07T12:05:00Z"), /7 Oct 2026, 17:05/);
  assert.equal(dateTimeText(null), "-");
  assert.equal(agoText(1_000_000, 1_000_000 + 20_000), "just now");
  assert.equal(agoText(1_000_000, 1_000_000 + 14 * 60_000), "14 min ago");
  assert.equal(agoText(1_000_000, 1_000_000 + 125 * 60_000), "2 h 05 min ago");
  assert.equal(agoText(1_000_000, 1_000_000 + 3 * 24 * 60 * 60_000), "3 days ago");
  assert.equal(untilText(new Date("2026-10-07T12:12:00Z"), new Date("2026-10-07T12:00:00Z")), "in 12 min");
  assert.equal(untilText(new Date("2026-10-07T17:20:00Z"), new Date("2026-10-07T12:00:00Z")), "in 5 h 20 min");
  assert.equal(snippet("  a   short   question  "), "a short question");
  assert.equal(snippet("x".repeat(200), 20).length, 20, "a shortened line is never longer than asked, dots included");
  assert.ok(snippet("x".repeat(200), 20).endsWith("..."));
});

await check("B2 the feedback language is checked: an Uzbek request answered in English is caught (and asked for once more), Uzbek text is not, English requests are never checked", () => {
  const uzbek = { summary: "Sizning javobingizda umumiy fikrni aytib berdingiz, lekin savolga to'liq javob bermadingiz. Sizga savolga aniqroq javob berishga harakat qiling.", strengths: ["Fikringizni aniq boshladingiz va bir nechta sabab keltirdingiz"], mistakes: [{ problem: "Fe'l shakli noto'g'ri: 'many people move' bu yerda to'g'ri, lekin 'have' o'rniga 'there are' kerak" }] };
  const english = { summary: "You spoke clearly but the response was quite short and didn't fully address the question. You should try to expand on why young people move to the cities.", strengths: ["You gave a clear opening and a reason"], mistakes: [{ problem: "A subject is missing in this sentence" }] };
  assert.equal(languageReason(uzbek, "uz"), null, "Uzbek text with an English quote in it is fine");
  assert.match(languageReason(english, "uz"), /must be written in Uzbek/);
  assert.equal(languageReason(english, "en"), null, "an English request is never second-guessed");
  assert.equal(languageReason(uzbek, "en"), null);
  assert.equal(writtenInEnglish("Yaxshi"), false, "too short to tell");
  assert.ok(englishShare(english.summary) > 0.2 && englishShare(uzbek.summary) < 0.05, `${englishShare(english.summary)} / ${englishShare(uzbek.summary)}`);
  const withUz = buildAssessmentPrompt({ part: 3, question: "Why?", cueCardPoints: [], notes: null, transcript: "Because of jobs and studies in the cities.", durationSeconds: 20, language: "uz", hasAudio: true });
  assert.match(withUz.user, /Feedback language: UZBEK \(Latin script\)/);
  assert.match(withUz.user, /NOT in English/);
  const withEn = buildAssessmentPrompt({ part: 3, question: "Why?", cueCardPoints: [], notes: null, transcript: "Because of jobs and studies in the cities.", durationSeconds: 20, language: "en", hasAudio: true });
  assert.match(withEn.user, /Feedback language: English/);
  assert.match(withEn.system, /\(in the feedback language\)/, "the JSON example no longer pulls the model towards English");
});

console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
