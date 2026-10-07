"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ClipboardPaste, Eye, Loader2, Rocket, Save } from "lucide-react";
import { toast } from "sonner";

import { getBuilderVersionAction, saveBuilderAction } from "@/actions/test-builder.actions";
import { previousLiveVersionAction, setPublishedAction, setTestCoverImageAction } from "@/actions/test-management.actions";
import type { PreviousLiveVersion } from "@/lib/exam/test-versions";
import { applyAnswerKey, parseAnswerKey } from "@/lib/exam/answer-key-paste";
import { emptyPart, layoutOf, moveWithin, previewOf, toValidatorInput, type BuilderGroup, type BuilderModel, type BuilderPart, type Skill } from "@/lib/exam/builder-model";
import { CUSTOM_MAX_PARTS, FORMAT_LABEL, isCustomFormat, type TestFormatValue } from "@/lib/exam/test-format";
import type { BuilderPartInfo } from "@/lib/exam/test-builder";
import { validateTestStructure, type IssueTarget, type TestIssue } from "@/lib/exam/test-validation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ContentCoverImageUploader } from "@/components/teacher/content-cover-image-uploader";
import { PublishIssuesDialog } from "@/components/teacher/publish-issues-dialog";
import { PublishVersionDialog, publishMessage } from "@/components/teacher/publish-version-dialog";
import { ChecklistPanel } from "@/components/teacher/test-builder/checklist-panel";
import { FIELD, NativeSelect } from "@/components/teacher/test-builder/controls";
import { ListeningAudioCard } from "@/components/teacher/test-builder/listening-audio-card";
import { PartEditor } from "@/components/teacher/test-builder/part-editor";
import { PasteKeyDialog } from "@/components/teacher/test-builder/paste-key-dialog";
import { cn } from "@/lib/utils";

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict" | "locked";

const SAVE_DELAY_MS = 1200;
const RETRY_DELAY_MS = 5000;

/** Gives the ids the server just made to the elements of the CURRENT model that still have none (matched by key; edits made meanwhile are untouched). */
function mergeIds(model: BuilderModel, ids: Record<string, string>): BuilderModel {
  if (Object.keys(ids).length === 0) return model;
  const next: BuilderModel = structuredClone(model);
  for (const part of next.parts) {
    if (!part.passageId && ids[part.key]) part.passageId = ids[part.key];
    for (const group of part.groups) {
      if (!group.groupId && ids[group.key]) group.groupId = ids[group.key];
      if (!group.questionId && ids[`${group.key}:row`]) group.questionId = ids[`${group.key}:row`];
      for (const item of group.items) if (!item.questionId && ids[item.key]) item.questionId = ids[item.key];
    }
  }
  return next;
}

/** After a part was added or removed: a part still called "Part 3" (the name it got) is renamed to its new place; a part the teacher named is left alone. */
function relabelDefaultTitles(parts: BuilderPart[], skill: Skill) {
  const word = skill === "LISTENING" ? "Part" : "Passage";
  parts.forEach((part, index) => {
    if (/^(Part|Passage) \d+$/.test(part.title.trim())) part.title = `${word} ${index + 1}`;
  });
}

/** Brings the element a problem is about into view and flashes it. Works with ids of stored rows and with the keys of rows not saved yet. */
function jumpTo(target: IssueTarget) {
  const candidates = [
    target.questionId && `focus-question-${target.questionId}`,
    target.groupId && `focus-group-${target.groupId}`,
    target.kind === "audio" && "focus-audio",
    target.kind === "times" && "focus-times",
    target.partId && `focus-part-${target.partId}`,
    "builder-top",
  ].filter((id): id is string => typeof id === "string");
  for (const id of candidates) {
    const element = document.getElementById(id);
    if (!element) continue;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("ring-2", "ring-accent");
    window.setTimeout(() => element.classList.remove("ring-2", "ring-accent"), 1800);
    (element.querySelector("textarea, input, select") as HTMLElement | null)?.focus({ preventScroll: true });
    return;
  }
}

export function TestBuilder({
  testId,
  skill,
  initialModel,
  initialVersion,
  initialParts,
  coverImagePath,
  isNewVersion = false,
}: {
  testId: string;
  skill: Skill;
  initialModel: BuilderModel;
  initialVersion: string;
  initialParts: BuilderPartInfo[];
  coverImagePath: string | null;
  /** This test is a new version of another: publishing it offers to archive the one it replaces. */
  isNewVersion?: boolean;
}) {
  const router = useRouter();
  const [previousVersion, setPreviousVersion] = useState<PreviousLiveVersion | null>(null);
  const [model, setModel] = useState<BuilderModel>(initialModel);
  const [partInfos, setPartInfos] = useState<BuilderPartInfo[]>(initialParts);
  const [status, setStatus] = useState<SaveState>("saved");
  const [statusText, setStatusText] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<TestIssue[] | null>(null);

  const modelRef = useRef(model);
  const versionRef = useRef(initialVersion);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<SaveState>("saved");
  const setSaveState = useCallback((state: SaveState, text = "") => {
    statusRef.current = state;
    setStatus(state);
    setStatusText(text);
  }, []);

  // The recordings and pictures of the parts come from the server (uploads change them); the model itself is never reset from outside.
  useEffect(() => setPartInfos(initialParts), [initialParts]);

  const runSave = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    if (statusRef.current === "conflict" || statusRef.current === "locked") return Promise.resolve();
    if (revision.current === savedRevision.current) return Promise.resolve();
    const task = (async () => {
      try {
        // Loops while edits keep arriving, so one call to runSave() returns when everything typed so far has been saved (or failed).
        while (revision.current !== savedRevision.current) {
          const rev = revision.current;
          const snapshot = modelRef.current;
          setSaveState("saving");
          const result = await saveBuilderAction(testId, snapshot, versionRef.current);
          if (!result.success) {
            if (result.conflict) setSaveState("conflict", result.error);
            else if (result.locked) setSaveState("locked", result.error);
            else {
              setSaveState("error", result.error);
              timer.current = setTimeout(() => void runSave(), RETRY_DELAY_MS);
            }
            return;
          }
          versionRef.current = result.version;
          savedRevision.current = rev;
          // A save that added or removed a part says what recordings the parts have now (a new part shares the recording of the others).
          if (result.parts) setPartInfos(result.parts);
          const merged = mergeIds(modelRef.current, result.ids);
          if (merged !== modelRef.current) {
            modelRef.current = merged;
            setModel(merged);
          }
          setSavedAt(new Date());
        }
        setSaveState("saved");
      } catch {
        // The request itself failed (offline, server restarting): everything stays in the editor and the save is retried.
        setSaveState("error", "Not saved yet - trying again…");
        timer.current = setTimeout(() => void runSave(), RETRY_DELAY_MS);
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = task;
    return task;
  }, [testId, setSaveState]);

  const schedule = useCallback(
    (delay = SAVE_DELAY_MS) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void runSave(), delay);
    },
    [runSave]
  );

  const change = useCallback(
    (apply: (draft: BuilderModel) => void) => {
      const next: BuilderModel = structuredClone(modelRef.current);
      apply(next);
      modelRef.current = next;
      setModel(next);
      revision.current += 1;
      if (statusRef.current !== "conflict" && statusRef.current !== "locked") setSaveState("dirty");
      schedule();
    },
    [schedule, setSaveState]
  );

  /** Saves everything now (used before publishing and before leaving). */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await runSave();
  }, [runSave]);

  // Unsaved-changes warning: closing the tab, reloading, and following a link inside the app while something is not saved.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (statusRef.current === "saved") return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (statusRef.current === "saved") return;
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.getAttribute("href")?.startsWith("#") || anchor.origin !== window.location.origin) return;
      if (!window.confirm("This test has changes that are not saved yet. Leave anyway?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onHide);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  const layout = useMemo(() => layoutOf(model), [model]);
  const previews = useMemo(() => previewOf(model), [model]);
  const audio = useMemo(() => new Map(partInfos.map((info) => [info.id, { src: info.audioSrc, durationSeconds: info.audioDurationSeconds }])), [partInfos]);
  const validation = useMemo(() => validateTestStructure(toValidatorInput(model, skill, audio)), [model, skill, audio]);

  const custom = isCustomFormat(model.format);
  const changePart = (partIndex: number, apply: (part: BuilderPart) => void) => change((draft) => apply(draft.parts[partIndex]));

  function addPart() {
    change((draft) => {
      draft.parts.push(emptyPart(draft.parts.length, skill));
      relabelDefaultTitles(draft.parts, skill);
    });
  }

  function removePart(partIndex: number) {
    const count = layout.parts[partIndex]?.count ?? 0;
    const name = `${skill === "LISTENING" ? "Part" : "Passage"} ${partIndex + 1}`;
    if (!window.confirm(count > 0 ? `Remove ${name} and its ${count} question${count === 1 ? "" : "s"}? This cannot be undone.` : `Remove ${name}?`)) return;
    change((draft) => {
      draft.parts.splice(partIndex, 1);
      relabelDefaultTitles(draft.parts, skill);
    });
  }
  const changeGroup = (partIndex: number, groupIndex: number, apply: (group: BuilderGroup) => void) => change((draft) => apply(draft.parts[partIndex].groups[groupIndex]));

  /** The preview shows what is STORED, so anything not saved yet is saved first. The tab is opened at once (a click may open one; after an await it may not). */
  async function openPreview() {
    const tab = window.open("", "_blank");
    await flush();
    const url = `/teacher/preview/${testId}`;
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  }

  async function publish() {
    setPublishing(true);
    try {
      await flush();
      if (statusRef.current === "conflict" || statusRef.current === "locked") {
        toast.error("Fix the save problem first (see the message at the top).");
        return;
      }
      // A new version whose predecessor is still live asks first whether to archive that one (the dialog then calls publishNow with the answer).
      if (isNewVersion) {
        const found = await previousLiveVersionAction(testId);
        if (found.success && found.previous) {
          setPreviousVersion(found.previous);
          return;
        }
      }
      await publishNow(false);
    } finally {
      setPublishing(false);
    }
  }

  async function publishNow(archivePrevious: boolean) {
    setPublishing(true);
    try {
      const result = await setPublishedAction(testId, true, { archivePrevious });
      setPreviousVersion(null);
      if (result.success) {
        const message = publishMessage(result);
        if (message.warning) toast.warning(message.text);
        else toast.success(message.text);
        router.refresh();
      } else if (result.issues && result.issues.length > 0) setPublishIssues(result.issues);
      else toast.error(result.error);
    } finally {
      setPublishing(false);
    }
  }

  const statusLabel =
    status === "saved" ? (savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "All changes saved") : status === "saving" ? "Saving…" : status === "dirty" ? "Unsaved changes" : status === "error" ? "Not saved yet - reconnecting…" : status === "conflict" ? "Changed elsewhere" : "Locked";

  return (
    <div className="space-y-6" id="builder-top" data-testid="test-builder" data-save-state={status}>
      <div className="bg-background/95 sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 border-b px-1 py-2 backdrop-blur-sm" data-testid="builder-bar">
        <span className={cn("inline-flex items-center gap-1.5 text-sm", status === "error" || status === "conflict" || status === "locked" ? "text-destructive" : status === "saved" ? "text-muted-foreground" : "text-foreground")} data-testid="save-status" data-state={status} role="status" aria-live="polite">
          {status === "saving" ? <Loader2 className="size-4 animate-spin" /> : status === "saved" ? <CheckCircle2 className="size-4" /> : status === "dirty" ? <Save className="size-4" /> : <AlertCircle className="size-4" />}
          {statusLabel}
        </span>
        <nav className="text-muted-foreground flex items-center gap-1 text-xs" aria-label="Parts">
          {model.parts.map((part, index) => (
            <button key={part.key} type="button" className="hover:bg-secondary rounded-md px-2 py-1" onClick={() => jumpTo({ kind: "part", partId: part.passageId ?? part.key })} data-testid="jump-part">
              {skill === "LISTENING" ? `Part ${index + 1}` : `Passage ${index + 1}`}
              {layout.parts[index]?.count ? ` (${layout.parts[index].first}–${layout.parts[index].last})` : ""}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void openPreview()} data-testid="open-preview">
            <Eye className="size-4" /> Preview as student
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setPasteOpen(true)} data-testid="open-paste-key">
            <ClipboardPaste className="size-4" /> Paste answer key
          </Button>
          <Button type="button" size="sm" onClick={() => void publish()} disabled={publishing || status === "conflict" || status === "locked"} data-testid="publish-test">
            {publishing ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Publish
          </Button>
        </div>
      </div>

      {(status === "conflict" || status === "locked" || (status === "error" && statusText)) && (
        <div className="border-destructive/40 bg-destructive/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm" role="alert" data-testid="save-problem">
          <span>{statusText}</span>
          {(status === "conflict" || status === "locked") && (
            <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>
              Reload the page
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          <section className="border-border/70 bg-card space-y-3 rounded-2xl border p-4" data-testid="test-settings">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="builder-title">
                  Test title
                </label>
                <input id="builder-title" className={FIELD} value={model.title} onChange={(event) => change((d) => void (d.title = event.target.value))} data-testid="test-title" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="builder-duration">
                  Minutes
                </label>
                <input id="builder-duration" className={FIELD} type="number" min={1} max={300} value={model.durationMinutes ?? ""} onChange={(event) => change((d) => void (d.durationMinutes = event.target.value ? Number(event.target.value) : null))} data-testid="test-duration" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="builder-description">
                Description (optional)
              </label>
              <Textarea id="builder-description" rows={2} value={model.description} onChange={(event) => change((d) => void (d.description = event.target.value))} />
            </div>
            <div className="space-y-1.5" data-testid="format-setting">
              <label className="text-sm font-medium" htmlFor="builder-format">
                Test format
              </label>
              <NativeSelect
                id="builder-format"
                value={model.format ?? "FULL_IELTS"}
                onChange={(event) => change((d) => void (d.format = event.target.value as TestFormatValue))}
                disabled={status === "conflict" || status === "locked"}
                data-testid="test-format"
              >
                <option value="FULL_IELTS">{FORMAT_LABEL.FULL_IELTS}</option>
                <option value="CUSTOM">{FORMAT_LABEL.CUSTOM}</option>
              </NativeSelect>
              <p className="text-muted-foreground text-xs" data-testid="format-note">
                {custom
                  ? `Any number of questions (at least 1) and up to ${CUSTOM_MAX_PARTS} parts, numbered 1 to the last straight through. Students see their score and percentage, never an IELTS band, and it cannot be used in a Full Mock.`
                  : "Exactly 40 questions in the official parts. Results are given an IELTS band, and the test can be used in a Full Mock."}
              </p>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={model.category === "CAMBRIDGE"} onCheckedChange={(checked) => change((d) => void (d.category = checked ? "CAMBRIDGE" : "GENERAL"))} />
              Cambridge test (free for every student, no subscription required)
            </label>
            <ContentCoverImageUploader
              initialPath={coverImagePath}
              alt="Cover"
              action={async (formData) => {
                // The cover is written on the test's own row, which is also what a save is checked against: take the new version so the next save is not mistaken for a clash.
                const result = await setTestCoverImageAction(testId, formData);
                if (result.success) {
                  const fresh = await getBuilderVersionAction(testId);
                  if (fresh.success) versionRef.current = fresh.version;
                }
                return result;
              }}
            />
          </section>

          {skill === "LISTENING" && (
            <ListeningAudioCard
              testId={testId}
              parts={partInfos}
              startSeconds={model.parts.map((part, index) => (index === 0 ? null : part.startSeconds))}
              disabled={status === "conflict" || status === "locked"}
              onStartChange={(partIndex, seconds) => change((d) => void (d.parts[partIndex].startSeconds = seconds))}
              onAudioChanged={setPartInfos}
            />
          )}

          {model.parts.map((part, partIndex) => (
            <PartEditor
              key={part.key}
              testId={testId}
              part={part}
              partIndex={partIndex}
              skill={skill}
              layout={layout.parts[partIndex]}
              previews={previews}
              info={partInfos.find((info) => info.id === part.passageId)}
              onChange={(apply) => changePart(partIndex, apply)}
              onGroupChange={(groupIndex, apply) => changeGroup(partIndex, groupIndex, apply)}
              onMoveGroup={(groupIndex, direction) => change((d) => moveWithin(d.parts[partIndex].groups, groupIndex, direction))}
              onDeleteGroup={(groupIndex) => change((d) => void d.parts[partIndex].groups.splice(groupIndex, 1))}
              onAddGroup={(group) => change((d) => void d.parts[partIndex].groups.push(group))}
              onRemove={custom && model.parts.length > 1 ? () => removePart(partIndex) : undefined}
            />
          ))}

          {custom && (
            <div className="border-border/70 flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3" data-testid="add-part">
              <Button type="button" variant="outline" onClick={addPart} disabled={model.parts.length >= CUSTOM_MAX_PARTS || status === "conflict" || status === "locked"} data-testid="add-part-button">
                Add {skill === "LISTENING" ? "a part" : "a passage"}
              </Button>
              <span className="text-muted-foreground text-xs">
                {model.parts.length} of {CUSTOM_MAX_PARTS} {skill === "LISTENING" ? "parts" : "passages"}. {skill === "LISTENING" ? "A new part shares the recording already uploaded." : ""}
              </span>
            </div>
          )}
        </div>

        <div className="xl:sticky xl:top-16 xl:self-start">
          <ChecklistPanel validation={validation} onGo={jumpTo} format={model.format} />
        </div>
      </div>

      <PasteKeyDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        model={model}
        onApply={(text) => {
          const { model: next, applied } = applyAnswerKey(modelRef.current, parseAnswerKey(text));
          change((draft) => {
            draft.parts = next.parts;
          });
          toast.success(`${applied} answer${applied === 1 ? "" : "s"} written. They are saved with the test.`);
          return applied;
        }}
      />

      <PublishIssuesDialog testId={testId} issues={publishIssues ?? []} open={publishIssues !== null} onOpenChange={(open) => !open && setPublishIssues(null)} onGo={jumpTo} />
      <PublishVersionDialog key={previousVersion?.id ?? "none"} previous={previousVersion} busy={publishing} onConfirm={(archive) => void publishNow(archive)} onCancel={() => setPreviousVersion(null)} />
    </div>
  );
}
