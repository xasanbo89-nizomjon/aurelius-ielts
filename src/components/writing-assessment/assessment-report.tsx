import { AlertTriangle, CheckCircle2, Gauge, Lightbulb, Quote, Repeat, Sparkles } from "lucide-react";

import type { EffectiveBands } from "@/lib/writing-assessment/assessment";
import { AI_ESTIMATE_LABEL, TASK_LABEL, TASK_WEIGHT, type TaskKey } from "@/lib/writing-assessment/constants";
import { bandText } from "@/lib/writing-assessment/bands";
import { lengthText } from "@/lib/writing-assessment/length-rules";
import { CRITERION_KEYS, MISTAKE_LABEL, criterionLabel, type StoredReport, type TaskReport } from "@/lib/writing-assessment/report";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Phase O - the combined report of one Writing sitting: the Writing band and how it is made, then each task's four criteria, its mistakes with the student's own words
 * quoted and corrected, vocabulary suggestions and what to do next. Pure presentation of the stored report - nothing here calls the AI, and the caller decides who may see
 * it (a student only when the result is shown to them). Always labelled "AI estimate — not an official IELTS score".
 */

function CriterionCard({ task, criterion, band, comment }: { task: TaskKey; criterion: (typeof CRITERION_KEYS)[number]; band: number; comment: string }) {
  return (
    <Card className="gap-2 py-4" data-testid={`criterion-${task}-${criterion}`}>
      <CardContent className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">{criterionLabel(criterion, task)}</p>
          <p className="font-display text-2xl font-medium tabular-nums">{bandText(band)}</p>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">{comment}</p>
      </CardContent>
    </Card>
  );
}

function TaskSection({ report, band, teacherMarked }: { report: TaskReport; band: number | null; teacherMarked: boolean }) {
  const key = report.task;
  return (
    <section className="space-y-4" data-testid={`task-report-${key}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-display text-xl font-medium tracking-tight">{TASK_LABEL[key]}</h2>
        <Badge variant="accent" data-testid={`task-band-${key}`}>
          Band {bandText(band ?? report.band)}
        </Badge>
        {teacherMarked && <Badge variant="outline">Marked by your teacher</Badge>}
        <span className="text-muted-foreground text-xs" data-testid={`task-length-${key}`}>
          {report.noResponse ? "No response" : lengthText(report.wordCount, report.minWords)}
        </span>
      </div>

      {report.lengthCap && (
        <div className="border-destructive/30 bg-destructive/10 flex gap-2 rounded-xl border px-3 py-2 text-xs" role="note">
          <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Under the minimum length: {criterionLabel("taskResponse", key)} is held at band {report.lengthCap.to} (it was {report.lengthCap.from}).
          </p>
        </div>
      )}

      <p className="text-sm leading-relaxed">{report.summary}</p>

      {report.noResponse ? null : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {CRITERION_KEYS.map((criterion) => (
              <CriterionCard key={criterion} task={key} criterion={criterion} band={report.criteria[criterion].band} comment={report.criteria[criterion].comment} />
            ))}
          </div>

          {(report.strengths.length > 0 || report.improvements.length > 0) && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {report.strengths.length > 0 && (
                <Card className="gap-2 py-4">
                  <CardHeader className="pb-0">
                    <CardTitle className="text-success flex items-center gap-1.5 text-sm">
                      <CheckCircle2 className="size-4" aria-hidden="true" /> What works
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                      {report.strengths.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {report.improvements.length > 0 && (
                <Card className="gap-2 py-4">
                  <CardHeader className="pb-0">
                    <CardTitle className="text-accent flex items-center gap-1.5 text-sm">
                      <Lightbulb className="size-4" aria-hidden="true" /> What to improve first
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
                      {report.improvements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {report.mistakes.length > 0 && (
            <Card className="gap-3 py-4" data-testid={`mistakes-${key}`}>
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <Quote className="text-accent size-4" aria-hidden="true" /> Mistakes in your text, with corrections
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-border/70 divide-y">
                  {report.mistakes.map((mistake, index) => (
                    <li key={`${mistake.quote}-${index}`} className="space-y-1 py-2.5 text-sm first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[11px]">
                          {MISTAKE_LABEL[mistake.category]}
                        </Badge>
                      </div>
                      <p className="break-words">
                        <span className="text-destructive line-through decoration-1">{mistake.quote}</span> <span aria-hidden="true">→</span>{" "}
                        <span className="text-success font-medium">{mistake.correction}</span>
                      </p>
                      {mistake.explanation && <p className="text-muted-foreground text-xs">{mistake.explanation}</p>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {(report.vocabulary.length > 0 || report.repeatedWords.length > 0) && (
            <Card className="gap-3 py-4" data-testid={`vocabulary-${key}`}>
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <Sparkles className="text-accent size-4" aria-hidden="true" /> Vocabulary suggestions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.vocabulary.length > 0 && (
                  <ul className="space-y-2">
                    {report.vocabulary.map((item) => (
                      <li key={item.insteadOf} className="text-sm">
                        <span className="text-muted-foreground">Instead of</span> <span className="font-medium">&ldquo;{item.insteadOf}&rdquo;</span>
                        <span className="text-muted-foreground"> try </span>
                        <span className="text-success font-medium">{item.better.join(", ")}</span>
                        {item.note && <span className="text-muted-foreground block text-xs">{item.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {report.repeatedWords.length > 0 && (
                  <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                    <Repeat className="size-3.5" aria-hidden="true" /> Repeated too often:
                    {report.repeatedWords.map((word) => (
                      <Badge key={word} variant="outline" className="text-[11px]">
                        {word}
                      </Badge>
                    ))}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </section>
  );
}

export function AssessmentReport({ report, bands, model, compact = false }: { report: StoredReport; bands: EffectiveBands; model?: string | null; compact?: boolean }) {
  const sitting = report.task1 && report.task2;
  const tasks = (["task1", "task2"] as const).filter((key) => report[key]);
  return (
    <div className="space-y-8" data-testid="assessment-report">
      <Card className="border-accent/20 bg-accent/[0.04]">
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-4">
            <span className="bg-secondary text-accent flex size-12 shrink-0 items-center justify-center rounded-xl">
              <Gauge className="size-6" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <p className="text-muted-foreground text-sm font-medium">{sitting ? "Writing band" : `${TASK_LABEL[tasks[0] ?? "task1"]} band`}</p>
              <p className="font-display text-4xl font-medium tracking-tight tabular-nums" data-testid="writing-band">
                {bandText(sitting ? bands.writing : bands[tasks[0] ?? "task1"])}
              </p>
            </div>
          </div>
          {sitting && (
            <div className="text-muted-foreground text-sm" data-testid="band-formula">
              <p>
                Task 1 <span className="text-foreground font-medium tabular-nums">{bandText(bands.task1)}</span> · Task 2{" "}
                <span className="text-foreground font-medium tabular-nums">{bandText(bands.task2)}</span>
              </p>
              <p className="text-xs">
                Writing = (Task 1 + {TASK_WEIGHT.task2} × Task 2) ÷ {TASK_WEIGHT.task1 + TASK_WEIGHT.task2}, to the nearest half band. Task 2 counts double.
              </p>
            </div>
          )}
          <p className="text-muted-foreground max-w-xs text-xs sm:ml-auto" data-testid="ai-estimate-label">
            {AI_ESTIMATE_LABEL}
            {model && !compact ? ` (${model})` : ""}
          </p>
        </CardContent>
      </Card>

      {tasks.map((key) => (
        <TaskSection key={key} report={report[key] as TaskReport} band={bands[key]} teacherMarked={bands.teacherMarked[key]} />
      ))}
    </div>
  );
}
