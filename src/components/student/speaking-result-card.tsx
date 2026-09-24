import { AlertTriangle, CheckCircle2, Gauge, ListChecks, MessageSquareText, Minus, ThumbsDown, ThumbsUp, TrendingDown, TrendingUp } from "lucide-react";

import type { SpeakingResultDetail } from "@/lib/speaking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function SubBandCard({ label, value }: { label: string; value: number | null }) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className="font-display text-2xl font-medium tracking-tight">{value != null ? value.toFixed(1) : "—"}</p>
      </CardContent>
    </Card>
  );
}

function ProgressBadge({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null || previous == null) return null;

  const delta = Math.round((current - previous) * 10) / 10;
  if (delta === 0) {
    return (
      <Badge variant="outline" className="gap-1">
        <Minus className="size-3.5" /> Same as your last attempt ({previous.toFixed(1)})
      </Badge>
    );
  }
  if (delta > 0) {
    return (
      <Badge variant="success" className="gap-1">
        <TrendingUp className="size-3.5" /> Up {delta.toFixed(1)} from your last attempt ({previous.toFixed(1)})
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <TrendingDown className="size-3.5" /> Down {Math.abs(delta).toFixed(1)} from your last attempt ({previous.toFixed(1)})
    </Badge>
  );
}

export function SpeakingResultCard({ result }: { result: SpeakingResultDetail }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="bg-secondary text-accent flex size-12 shrink-0 items-center justify-center rounded-xl">
              <Gauge className="size-6" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-muted-foreground text-sm font-medium">Overall Speaking Band</p>
              <p className="font-display text-3xl font-medium tracking-tight">
                {result.bandScore != null ? result.bandScore.toFixed(1) : "—"}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <ProgressBadge current={result.bandScore} previous={result.previousBandScore} />
            <p className="text-muted-foreground max-w-xs text-right text-xs">This is an AI estimate, not an official IELTS score.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SubBandCard label="Fluency & Coherence" value={result.fluencyBand} />
        <SubBandCard label="Lexical Resource" value={result.lexicalBand} />
        <SubBandCard label="Grammatical Range & Accuracy" value={result.grammarBand} />
        <SubBandCard label="Pronunciation" value={result.pronunciationBand} />
      </div>
      <p className="text-muted-foreground -mt-3 text-xs">
        Pronunciation is estimated from speech pacing and clarity signals in your recording, not from direct acoustic analysis.
      </p>

      {result.feedback && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overall Feedback</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm leading-relaxed">{result.feedback}</CardContent>
        </Card>
      )}

      {(result.strengths.length > 0 || result.weaknesses.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ThumbsUp className="text-success size-4.5" aria-hidden="true" /> Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.strengths.length === 0 ? (
                <p className="text-muted-foreground text-sm">Not available for this attempt.</p>
              ) : (
                <ul className="space-y-2">
                  {result.strengths.map((item, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ThumbsDown className="text-destructive size-4.5" aria-hidden="true" /> Weaknesses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.weaknesses.length === 0 ? (
                <p className="text-muted-foreground text-sm">Not available for this attempt.</p>
              ) : (
                <ul className="space-y-2">
                  {result.weaknesses.map((item, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {result.improvements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="text-accent size-4.5" aria-hidden="true" /> Recommended Improvements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.improvements.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {result.teacherNotes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="text-accent size-4.5" aria-hidden="true" /> Teacher Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm leading-relaxed">{result.teacherNotes}</CardContent>
        </Card>
      )}
    </div>
  );
}
