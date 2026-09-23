import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Gauge,
  ListChecks,
  MessageSquareText,
  Repeat,
  SpellCheck2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import type { WritingAnalysisRecord } from "@/lib/ai/writing";
import { GRAMMAR_ISSUE_CATEGORY_LABELS as CATEGORY_LABELS } from "@/lib/labels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EssayMistakeHighlighter } from "@/components/student/essay-mistake-highlighter";

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

export function WritingAnalysisView({ analysis, content }: { analysis: WritingAnalysisRecord; content: string }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="bg-secondary text-accent flex size-12 shrink-0 items-center justify-center rounded-xl">
              <Gauge className="size-6" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-muted-foreground text-sm font-medium">Overall Estimated Band</p>
              <p className="font-display text-3xl font-medium tracking-tight">{analysis.estimatedBand.toFixed(1)}</p>
            </div>
          </div>
          <p className="text-muted-foreground max-w-xs text-xs">
            This is an AI estimate, not an official IELTS score.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SubBandCard label="Task Response" value={analysis.taskResponseBand} />
        <SubBandCard label="Coherence & Cohesion" value={analysis.coherenceBand} />
        <SubBandCard label="Lexical Resource" value={analysis.vocabularyBand} />
        <SubBandCard label="Grammatical Range & Accuracy" value={analysis.grammarBand} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenCheck className="text-accent size-4.5" aria-hidden="true" /> Task Achievement
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm leading-relaxed">{analysis.taskAchievement}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="text-accent size-4.5" aria-hidden="true" /> Coherence &amp; Cohesion
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm leading-relaxed">{analysis.coherenceCohesion}</CardContent>
        </Card>
      </div>

      {(analysis.strengths.length > 0 || analysis.weaknesses.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ThumbsUp className="text-success size-4.5" aria-hidden="true" /> Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analysis.strengths.length === 0 ? (
                <p className="text-muted-foreground text-sm">Not available for this analysis.</p>
              ) : (
                <ul className="space-y-2">
                  {analysis.strengths.map((item, index) => (
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
              {analysis.weaknesses.length === 0 ? (
                <p className="text-muted-foreground text-sm">Not available for this analysis.</p>
              ) : (
                <ul className="space-y-2">
                  {analysis.weaknesses.map((item, index) => (
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SpellCheck2 className="text-accent size-4.5" aria-hidden="true" /> Mistakes in Your Essay
          </CardTitle>
          <CardDescription>Highlighted inline — hover a highlight for the correction and explanation.</CardDescription>
        </CardHeader>
        <CardContent>
          {analysis.grammarIssues.length === 0 ? (
            <p className="text-muted-foreground text-sm">No mistakes flagged — nice work.</p>
          ) : (
            <EssayMistakeHighlighter content={content} issues={analysis.grammarIssues} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SpellCheck2 className="text-accent size-4.5" aria-hidden="true" /> Grammar Analysis
          </CardTitle>
          <CardDescription>Grammar, spelling, word form, tense, article, preposition, linking words, and informal language.</CardDescription>
        </CardHeader>
        <CardContent>
          {analysis.grammarIssues.length === 0 ? (
            <p className="text-muted-foreground text-sm">No mistakes flagged — nice work.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Mistake</TableHead>
                  <TableHead>Correction</TableHead>
                  <TableHead>Explanation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysis.grammarIssues.map((issue, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Badge variant="outline">{CATEGORY_LABELS[issue.category]}</Badge>
                    </TableCell>
                    <TableCell className="text-destructive max-w-48">{issue.mistake}</TableCell>
                    <TableCell className="text-success max-w-48">{issue.correction}</TableCell>
                    <TableCell className="text-muted-foreground max-w-xs">{issue.explanation}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Repeat className="text-accent size-4.5" aria-hidden="true" /> Vocabulary Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Repeated words</p>
              {analysis.vocabulary.repeatedWords.length === 0 ? (
                <p className="text-muted-foreground text-xs">None found.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {analysis.vocabulary.repeatedWords.map((word, index) => (
                    <Badge key={index} variant="outline">
                      {word}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Weak vocabulary</p>
              {analysis.vocabulary.weakVocabulary.length === 0 ? (
                <p className="text-muted-foreground text-xs">None found.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {analysis.vocabulary.weakVocabulary.map((word, index) => (
                    <Badge key={index} variant="destructive">
                      {word}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {analysis.vocabulary.betterAlternatives.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Better alternatives</p>
              <ul className="space-y-1.5 text-sm">
                {analysis.vocabulary.betterAlternatives.map((entry, index) => (
                  <li key={index} className="flex flex-wrap items-center gap-2">
                    <Badge variant="destructive">{entry.word}</Badge>
                    <span className="text-muted-foreground">→</span>
                    {entry.alternatives.map((alt, altIndex) => (
                      <Badge key={altIndex} variant="success">
                        {alt}
                      </Badge>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="text-accent size-4.5" aria-hidden="true" /> Most Important Improvements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {analysis.keyImprovements.map((improvement, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {improvement}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
