import { BookOpen, Headphones, Mic, PenLine } from "lucide-react";

import type { ReadingListeningMistake, WritingMistake, SpeakingReviewEntry } from "@/lib/analytics/mistake-center";
import { formatRelativeTime } from "@/lib/format";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WrongAnswerCard } from "@/components/exam/wrong-answer-card";

function SkillGroup({ title, icon: Icon, empty, children }: { title: string; icon: typeof BookOpen; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide uppercase">
        <Icon className="text-accent size-4" aria-hidden="true" /> {title}
      </h3>
      {empty ? <p className="text-muted-foreground text-sm">No mistakes recorded here yet.</p> : children}
    </section>
  );
}

export function MistakeCenterView({
  readingMistakes,
  listeningMistakes,
  writingMistakes,
  speakingReviews,
}: {
  readingMistakes: ReadingListeningMistake[];
  listeningMistakes: ReadingListeningMistake[];
  writingMistakes: WritingMistake[];
  speakingReviews: SpeakingReviewEntry[];
}) {
  const isEmpty =
    readingMistakes.length === 0 && listeningMistakes.length === 0 && writingMistakes.length === 0 && speakingReviews.length === 0;

  if (isEmpty) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No mistakes yet"
        description="Once you complete tests and get feedback, real mistakes from Reading, Listening, Writing and Speaking will show up here, grouped by skill."
      />
    );
  }

  return (
    <div className="space-y-8">
      <SkillGroup title="Reading" icon={BookOpen} empty={readingMistakes.length === 0}>
        <div className="space-y-3">
          {readingMistakes.map((mistake, index) => (
            <WrongAnswerCard
              key={`${mistake.resultId}-${mistake.questionId}`}
              resultId={mistake.resultId}
              questionId={mistake.questionId}
              index={index + 1}
              prompt={`${mistake.testTitle} — ${mistake.prompt}`}
              answered
            />
          ))}
        </div>
      </SkillGroup>

      <SkillGroup title="Listening" icon={Headphones} empty={listeningMistakes.length === 0}>
        <div className="space-y-3">
          {listeningMistakes.map((mistake, index) => (
            <WrongAnswerCard
              key={`${mistake.resultId}-${mistake.questionId}`}
              resultId={mistake.resultId}
              questionId={mistake.questionId}
              index={index + 1}
              prompt={`${mistake.testTitle} — ${mistake.prompt}`}
              answered
            />
          ))}
        </div>
      </SkillGroup>

      <SkillGroup title="Writing" icon={PenLine} empty={writingMistakes.length === 0}>
        <div className="space-y-3">
          {writingMistakes.map((mistake, index) => (
            <Card key={`${mistake.submissionId}-${index}`} className="py-4">
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{mistake.taskType}</Badge>
                  <Badge variant="secondary">{mistake.category}</Badge>
                </div>
                <p className="text-sm">
                  <span className="text-destructive line-through">{mistake.mistake}</span>
                  {" → "}
                  <span className="text-success font-medium">{mistake.correction}</span>
                </p>
                <p className="text-muted-foreground text-sm">{mistake.explanation}</p>
                <p className="text-muted-foreground/70 text-xs">{formatRelativeTime(mistake.createdAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </SkillGroup>

      <SkillGroup title="Speaking" icon={Mic} empty={speakingReviews.length === 0}>
        <div className="space-y-3">
          {speakingReviews.map((review) => (
            <Card key={review.submissionId} className="py-4">
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {review.taskTitle} — Part {review.part}
                  </span>
                  <Badge variant="accent">Band {review.bandScore.toFixed(1)}</Badge>
                </div>
                <p className="text-muted-foreground text-sm">{review.feedback}</p>
                <p className="text-muted-foreground/70 text-xs">{formatRelativeTime(review.reviewedAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </SkillGroup>
    </div>
  );
}
