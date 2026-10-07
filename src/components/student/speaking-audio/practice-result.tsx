import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, Lightbulb, MessageSquareQuote, Quote, Sparkles, ThumbsUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RecordingPlayer } from "@/components/student/speaking-audio/recording-player";
import { readStoredAssessment } from "@/lib/speaking-audio/assessment";
import { CRITERIA } from "@/lib/speaking-audio/bands";
import { AI_ESTIMATE_LABEL, FEEDBACK_LANGUAGES, PART_GUIDE, type SpeakingPart } from "@/lib/speaking-audio/constants";
import { bandText, clock, dateTimeText } from "@/lib/speaking-audio/format";
import type { PracticeRecord } from "@/lib/speaking-audio/practice";

/**
 * Phase Q-B - one assessed practice, laid out: the overall band (always labelled as an AI estimate), the four criteria, what went well, the mistakes with their
 * corrections quoted from the student's own words, better vocabulary, a model answer about one band higher, what the AI heard, the recording and the teachers' comments.
 * Plain server-rendered markup (the only client piece is the audio player); the student's page and the teacher's page both use it.
 */

const CRITERION_FIELD = { fluency: "fluencyBand", lexical: "lexicalBand", grammar: "grammarBand", pronunciation: "pronunciationBand" } as const;

export function PartBadge({ part }: { part: number }) {
  return <Badge variant="outline">Part {part}</Badge>;
}

export function PracticeHeader({ practice, showStudent }: { practice: PracticeRecord; showStudent?: boolean }) {
  const points = Array.isArray(practice.cueCardPoints) ? practice.cueCardPoints.filter((point): point is string => typeof point === "string") : [];
  const language = FEEDBACK_LANGUAGES.find((option) => option.value === practice.feedbackLanguage)?.label ?? "English";
  return (
    <div className="space-y-3" data-testid="practice-header">
      <div className="flex flex-wrap items-center gap-2">
        <PartBadge part={practice.part} />
        <Badge variant="secondary">Feedback: {language}</Badge>
        {practice.audioSeconds != null && <Badge variant="secondary">{clock(practice.audioSeconds)} recorded</Badge>}
        <span className="text-muted-foreground text-xs">{dateTimeText(practice.submittedAt ?? practice.createdAt)}</span>
      </div>
      {showStudent && (
        <p className="text-sm">
          <span className="text-muted-foreground">Student: </span>
          <span className="font-medium">{practice.student.user.name ?? practice.student.user.email}</span>
          {practice.student.user.name && <span className="text-muted-foreground"> ({practice.student.user.email})</span>}
        </p>
      )}
      <div className="border-border bg-card space-y-2 rounded-2xl border p-5">
        <p className="text-accent text-xs font-medium tracking-wide uppercase">{PART_GUIDE[practice.part as SpeakingPart]?.label ?? `Part ${practice.part}`}</p>
        <p className="font-display text-lg leading-snug font-medium whitespace-pre-line" data-testid="practice-question">
          {practice.question}
        </p>
        {points.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}
        {practice.notes && (
          <div className="bg-secondary/60 rounded-xl p-3 text-sm">
            <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Preparation notes</p>
            <p className="whitespace-pre-wrap">{practice.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function PracticeResult({
  practice,
  audio,
  audience,
  comments,
}: {
  practice: PracticeRecord;
  audio: { url: string; expiresInSeconds: number } | null;
  audience: "student" | "teacher";
  /** The teachers' comments (and, for a teacher, the form to add one) go under the feedback. */
  comments?: ReactNode;
}) {
  const assessment = readStoredAssessment(practice.assessment);

  return (
    <div className="space-y-6" data-testid="practice-result" data-overall={practice.overallBand ?? ""}>
      <Card className="border-primary/15 bg-primary/[0.03] py-8">
        <CardContent className="flex flex-col items-center gap-2 text-center">
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
            <Sparkles className="size-3.5" aria-hidden="true" /> Overall band
          </span>
          <p className="font-display text-7xl font-medium tabular-nums" data-testid="overall-band">
            {bandText(practice.overallBand)}
          </p>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs" data-testid="estimate-label">
            <AlertCircle className="size-3.5 shrink-0" />
            {AI_ESTIMATE_LABEL}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="criteria">
        {CRITERIA.map(({ key, label }) => {
          const band = practice[CRITERION_FIELD[key]];
          return (
            <Card key={key}>
              <CardContent className="space-y-2 py-4" data-criterion={key}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{label}</p>
                  <span className="font-display text-xl font-medium tabular-nums">{bandText(band)}</span>
                </div>
                <div className="bg-secondary h-1.5 overflow-hidden rounded-full" aria-hidden="true">
                  <div className="bg-accent h-full rounded-full" style={{ width: `${Math.min(100, ((band ?? 0) / 9) * 100)}%` }} />
                </div>
                {key === "pronunciation" && practice.pronunciationEstimated && (
                  <p className="text-muted-foreground text-xs" data-testid="pronunciation-estimated">
                    Estimated from the transcript - the AI could not listen to the recording this time.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {assessment ? (
        <>
          <Card>
            <CardContent className="space-y-2 py-5">
              <h2 className="font-display flex items-center gap-2 text-lg font-medium">
                <MessageSquareQuote className="text-accent size-5" /> In short
              </h2>
              <p className="text-sm leading-relaxed whitespace-pre-line" data-testid="summary">
                {assessment.summary}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 py-5">
              <h2 className="text-success flex items-center gap-2 text-lg font-medium">
                <ThumbsUp className="size-5" /> What went well
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="strengths">
                {assessment.strengths.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-5">
              <h2 className="font-display text-lg font-medium">Mistakes to fix</h2>
              {assessment.mistakes.length === 0 ? (
                <p className="text-muted-foreground text-sm" data-testid="no-mistakes">
                  The AI did not find a mistake worth listing in this answer.
                </p>
              ) : (
                <ul className="space-y-3" data-testid="mistakes">
                  {assessment.mistakes.map((mistake, index) => (
                    <li key={`${mistake.quote}-${index}`} className="border-border space-y-1.5 rounded-xl border p-3 text-sm">
                      <p className="flex items-start gap-2">
                        <Quote className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span className="text-destructive italic">{mistake.quote}</span>
                      </p>
                      <p className="text-muted-foreground">{mistake.problem}</p>
                      {mistake.correction.trim().toLowerCase() !== mistake.quote.trim().toLowerCase() && (
                        <p className="flex items-start gap-2">
                          <ArrowRight className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
                          <span className="text-success font-medium">{mistake.correction}</span>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {assessment.vocabulary.length > 0 && (
            <Card>
              <CardContent className="space-y-3 py-5">
                <h2 className="font-display flex items-center gap-2 text-lg font-medium">
                  <Lightbulb className="text-accent size-5" /> Better words to use
                </h2>
                <ul className="space-y-3" data-testid="vocabulary">
                  {assessment.vocabulary.map((item, index) => (
                    <li key={`${item.insteadOf}-${index}`} className="border-border space-y-1 rounded-xl border p-3 text-sm">
                      <p>
                        <span className="text-muted-foreground line-through">{item.insteadOf}</span> <ArrowRight className="mx-1 inline size-3.5" aria-hidden="true" /> <span className="font-medium">{item.better}</span>
                      </p>
                      <p className="text-muted-foreground italic">{item.example}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-2 py-5">
              <h2 className="font-display text-lg font-medium">A model answer, about one band higher</h2>
              <p className="text-muted-foreground text-xs">Read it, then say it in your own words - do not memorise it.</p>
              <p className="bg-secondary/60 rounded-xl p-4 text-sm leading-relaxed whitespace-pre-line" data-testid="sample-answer">
                {assessment.sampleAnswer}
              </p>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-5 text-sm">The written feedback of this practice could not be read. The bands above are correct.</CardContent>
        </Card>
      )}

      {practice.transcript && (
        <Card>
          <CardContent className="space-y-2 py-5">
            <h2 className="font-display text-lg font-medium">What the AI heard</h2>
            <p className="text-muted-foreground text-xs">A speech-to-text transcript. It can contain small mistakes that are not yours.</p>
            <p className="text-sm leading-relaxed whitespace-pre-line" data-testid="transcript">
              {practice.transcript}
            </p>
          </CardContent>
        </Card>
      )}

      {audio && (
        <Card>
          <CardContent className="space-y-2 py-5">
            <h2 className="font-display text-lg font-medium">{audience === "teacher" ? "The recording" : "Your recording"}</h2>
            <RecordingPlayer practiceId={practice.id} initialUrl={audio.url} initialExpiresInSeconds={audio.expiresInSeconds} />
          </CardContent>
        </Card>
      )}

      {comments}
    </div>
  );
}

export function CommentList({ comments }: { comments: PracticeRecord["comments"] }) {
  if (comments.length === 0) return null;
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <h2 className="font-display text-lg font-medium">Teacher comments</h2>
        <ul className="space-y-3" data-testid="comments">
          {comments.map((comment) => (
            <li key={comment.id} className="border-border rounded-xl border p-3 text-sm" data-testid="comment">
              <p className="whitespace-pre-line">{comment.body}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {comment.author.user.name ?? "Teacher"} - {dateTimeText(comment.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
