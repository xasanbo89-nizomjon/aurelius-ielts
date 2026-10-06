"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";

import { GROUP_KIND_META, LETTERS, countBlanks, emptyItem, moveWithin, optionLabel, type BuilderGroup, type GroupLayout, type PreviewGroupInfo, type PreviewRow, type Skill } from "@/lib/exam/builder-model";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AnswerInput, FIELD, NativeSelect, NumberBadge } from "@/components/teacher/test-builder/controls";
import { GroupPreview } from "@/components/teacher/test-builder/group-preview";

type Mutate = (apply: (group: BuilderGroup) => void) => void;

const TFNG_OPTIONS = [
  { value: "", label: "Choose the answer…" },
  { value: "TRUE", label: "True" },
  { value: "FALSE", label: "False" },
  { value: "NOT_GIVEN", label: "Not Given" },
];
const YNNG_OPTIONS = [
  { value: "", label: "Choose the answer…" },
  { value: "TRUE", label: "Yes" },
  { value: "FALSE", label: "No" },
  { value: "NOT_GIVEN", label: "Not Given" },
];

export function GroupEditor({
  group,
  layout,
  preview,
  skill,
  domId,
  canMoveUp,
  canMoveDown,
  onChange,
  onMove,
  onDelete,
}: {
  group: BuilderGroup;
  layout: GroupLayout;
  preview: { rows: PreviewRow[]; info: PreviewGroupInfo } | undefined;
  skill: Skill;
  domId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: Mutate;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
}) {
  const meta = GROUP_KIND_META[group.kind];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const textual = group.kind === "SENTENCE_COMPLETION" || group.kind === "FORM_COMPLETION" || group.kind === "SHORT_ANSWER" || meta.stored === "SUMMARY_COMPLETION";

  return (
    <section id={`focus-group-${domId}`} className="border-border/70 bg-card scroll-mt-24 space-y-4 rounded-2xl border p-4" data-testid="question-group" data-kind={group.kind}>
      <header className="flex flex-wrap items-center gap-2">
        <Badge variant="accent">{meta.label}</Badge>
        <span className="text-muted-foreground text-sm font-medium tabular-nums" data-testid="group-range">
          {layout.count === 0 ? "No questions yet" : layout.first === layout.last ? `Question ${layout.first}` : `Questions ${layout.first}–${layout.last}`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)} aria-pressed={showPreview} data-testid="toggle-preview">
            {showPreview ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {showPreview ? "Hide student view" : "Student view"}
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Move group up" disabled={!canMoveUp} onClick={() => onMove("up")} data-testid="move-group-up">
            <ArrowUp className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Move group down" disabled={!canMoveDown} onClick={() => onMove("down")} data-testid="move-group-down">
            <ArrowDown className="size-4" />
          </Button>
          {confirmDelete ? (
            <>
              <Button type="button" variant="destructive" size="sm" onClick={onDelete} data-testid="confirm-delete-group">
                Delete group
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" size="icon" aria-label="Delete group" onClick={() => setConfirmDelete(true)} data-testid="delete-group">
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </header>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor={`instr-${domId}`}>
          Instructions shown to the student
        </label>
        <Textarea id={`instr-${domId}`} rows={3} value={group.instructions} onChange={(event) => onChange((g) => void (g.instructions = event.target.value))} data-testid="group-instructions" />
        <p className="text-muted-foreground text-xs">{meta.hint}</p>
      </div>

      {meta.perNumber && <ItemsEditor group={group} layout={layout} skill={skill} domId={domId} onChange={onChange} />}
      {meta.stored === "MATCHING" && <MatchingEditor group={group} layout={layout} onChange={onChange} />}
      {meta.stored === "SUMMARY_COMPLETION" && <BlanksEditor group={group} layout={layout} domId={domId} onChange={onChange} />}

      {textual && <CompletionSettings group={group} onChange={onChange} />}

      {showPreview && preview && <GroupPreview rows={preview.rows} info={preview.info} />}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------

function CompletionSettings({ group, onChange }: { group: BuilderGroup; onChange: Mutate }) {
  const [bank, setBank] = useState(group.wordBank.join(", "));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor={`maxw-${group.key}`}>
          Word limit
        </label>
        <input
          id={`maxw-${group.key}`}
          className={FIELD}
          type="number"
          min={1}
          max={20}
          placeholder="none"
          value={group.maxWords ?? ""}
          onChange={(event) => onChange((g) => void (g.maxWords = event.target.value ? Number(event.target.value) : null))}
          data-testid="max-words"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor={`bank-${group.key}`}>
          Word list (optional, separated by commas)
        </label>
        <input
          id={`bank-${group.key}`}
          className={FIELD}
          value={bank}
          placeholder="currents, gravity, evaporation"
          onChange={(event) => {
            setBank(event.target.value);
            onChange((g) => void (g.wordBank = event.target.value.split(",").map((w) => w.trim()).filter(Boolean)));
          }}
          data-testid="word-bank"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// One question per item: multiple choice, true / false / not given, sentence / form / short answer
// ---------------------------------------------------------------------------------------------------------------------------------------------------

function ItemsEditor({ group, layout, skill, domId, onChange }: { group: BuilderGroup; layout: GroupLayout; skill: Skill; domId: string; onChange: Mutate }) {
  const multipleChoice = group.kind === "MULTIPLE_CHOICE";
  const truth = group.kind === "TRUE_FALSE_NOT_GIVEN" || group.kind === "YES_NO_NOT_GIVEN";
  const gapFill = group.kind === "SENTENCE_COMPLETION" || group.kind === "FORM_COMPLETION";

  return (
    <div className="space-y-3">
      {multipleChoice && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={group.allowMultiple} onChange={(event) => onChange((g) => void (g.allowMultiple = event.target.checked))} data-testid="allow-multiple" />
          More than one correct answer (&quot;choose TWO&quot; - it still counts as one numbered question)
        </label>
      )}

      {group.items.map((item, index) => {
        const itemId = item.questionId ?? item.key;
        const number = layout.itemNumbers[index];
        return (
          <div key={item.key} id={`focus-question-${itemId}`} className="border-border/60 bg-secondary/30 scroll-mt-24 space-y-2 rounded-xl border p-3" data-testid="question-item">
            <div className="flex items-start gap-2">
              <NumberBadge first={number} />
              <Textarea
                aria-label={`Question ${number} text`}
                rows={2}
                value={item.prompt}
                placeholder={truth ? "The statement…" : gapFill ? "The sentence, with ...... where the answer goes" : "The question…"}
                onChange={(event) => onChange((g) => void (g.items[index].prompt = event.target.value))}
                data-testid="item-prompt"
              />
              <div className="flex shrink-0 flex-col">
                <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Move question ${number} up`} disabled={index === 0} onClick={() => onChange((g) => moveWithin(g.items, index, "up"))} data-testid="move-item-up">
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Move question ${number} down`} disabled={index === group.items.length - 1} onClick={() => onChange((g) => moveWithin(g.items, index, "down"))} data-testid="move-item-down">
                  <ArrowDown className="size-3.5" />
                </Button>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove question ${number}`} disabled={group.items.length <= 1} onClick={() => onChange((g) => void g.items.splice(index, 1))} data-testid="remove-item">
                <Trash2 className="size-4" />
              </Button>
            </div>

            {multipleChoice && (
              <div className="space-y-1.5 pl-9">
                {item.choices.map((choice, choiceIndex) => (
                  <div key={choice.id} className="flex items-center gap-2">
                    <span className="w-5 text-sm font-medium">{choice.id}</span>
                    <input
                      className={FIELD}
                      aria-label={`Question ${number} option ${choice.id}`}
                      value={choice.text}
                      placeholder={`Option ${choice.id}`}
                      onChange={(event) => onChange((g) => void (g.items[index].choices[choiceIndex].text = event.target.value))}
                      data-testid="choice-text"
                    />
                    <input
                      type={group.allowMultiple ? "checkbox" : "radio"}
                      name={`correct-${domId}-${item.key}`}
                      aria-label={`Option ${choice.id} is correct`}
                      checked={item.correctChoiceIds.includes(choice.id)}
                      onChange={(event) =>
                        onChange((g) => {
                          const target = g.items[index];
                          if (!group.allowMultiple) target.correctChoiceIds = [choice.id];
                          else target.correctChoiceIds = event.target.checked ? [...target.correctChoiceIds, choice.id] : target.correctChoiceIds.filter((id) => id !== choice.id);
                        })
                      }
                      data-testid="choice-correct"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove option ${choice.id}`}
                      disabled={item.choices.length <= 2}
                      onClick={() =>
                        onChange((g) => {
                          const target = g.items[index];
                          target.choices.splice(choiceIndex, 1);
                          // keep the letters A, B, C… in order and the ticked answers on the same options
                          const old = target.choices.map((c) => c.id);
                          const selected = target.correctChoiceIds;
                          target.choices.forEach((c, i) => (c.id = LETTERS[i]));
                          target.correctChoiceIds = selected.map((id) => LETTERS[old.indexOf(id)]).filter(Boolean);
                        })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                {item.choices.length < 8 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => onChange((g) => void g.items[index].choices.push({ id: LETTERS[g.items[index].choices.length], text: "" }))}>
                    <Plus className="size-3.5" /> Add option
                  </Button>
                )}
              </div>
            )}

            {truth && (
              <div className="pl-9">
                <NativeSelect aria-label={`Answer to question ${number}`} value={item.tfng} onChange={(event) => onChange((g) => void (g.items[index].tfng = event.target.value))} data-testid="tfng-answer">
                  {(group.kind === "YES_NO_NOT_GIVEN" ? YNNG_OPTIONS : TFNG_OPTIONS).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}

            {!multipleChoice && !truth && (
              <div className="pl-9">
                <AnswerInput aria-label={`Answer to question ${number}`} answers={item.answers} onChange={(answers) => onChange((g) => void (g.items[index].answers = answers))} />
              </div>
            )}
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={() => onChange((g) => void g.items.push(emptyItem(g.kind)))} data-testid="add-item">
        <Plus className="size-4" /> Add {skill === "LISTENING" ? "question" : "question"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Matching: headings, features, endings, map / diagram labels
// ---------------------------------------------------------------------------------------------------------------------------------------------------

function MatchingEditor({ group, layout, onChange }: { group: BuilderGroup; layout: GroupLayout; onChange: Mutate }) {
  const headings = group.kind === "MATCHING_HEADINGS";
  const itemWord = headings ? "Paragraph" : group.kind === "DIAGRAM_LABELLING" ? "Label" : "Item";
  const listWord = headings ? "List of headings" : "Options";

  function relabel(g: BuilderGroup, removedIndex?: number) {
    const oldIds = g.options.map((o) => o.id);
    if (removedIndex !== undefined) g.options.splice(removedIndex, 1);
    const mapping = new Map<string, string>();
    g.options.forEach((option, index) => {
      const next = optionLabel(g.kind, index);
      const previous = removedIndex !== undefined ? oldIds[index >= removedIndex ? index + 1 : index] : oldIds[index];
      mapping.set(previous, next);
      option.id = next;
    });
    for (const [promptId, optionId] of Object.entries(g.matchAnswers)) {
      const next = mapping.get(optionId);
      if (next) g.matchAnswers[promptId] = next;
      else delete g.matchAnswers[promptId];
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <p className="text-sm font-medium">{itemWord}s to match</p>
        {group.prompts.map((prompt, index) => (
          <div key={prompt.id} className="flex items-center gap-2" data-testid="matching-prompt">
            <NumberBadge first={layout.itemNumbers[index] ?? layout.first + index} />
            <input className={FIELD} aria-label={`${itemWord} ${layout.itemNumbers[index] ?? layout.first + index} text`} value={prompt.text} placeholder={headings ? `Paragraph ${LETTERS[index] ?? index + 1}` : `${itemWord} text`} onChange={(event) => onChange((g) => void (g.prompts[index].text = event.target.value))} data-testid="prompt-text" />
            <NativeSelect aria-label={`Answer to question ${layout.itemNumbers[index] ?? layout.first + index}`} className="w-28 shrink-0" value={group.matchAnswers[prompt.id] ?? ""} onChange={(event) => onChange((g) => (event.target.value ? void (g.matchAnswers[prompt.id] = event.target.value) : void delete g.matchAnswers[prompt.id]))} data-testid="matching-answer">
              <option value="">Answer…</option>
              {group.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.id}
                </option>
              ))}
            </NativeSelect>
            <div className="flex shrink-0">
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Move ${itemWord.toLowerCase()} ${index + 1} up`} disabled={index === 0} onClick={() => onChange((g) => moveWithin(g.prompts, index, "up"))}>
                <ArrowUp className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Move ${itemWord.toLowerCase()} ${index + 1} down`} disabled={index === group.prompts.length - 1} onClick={() => onChange((g) => moveWithin(g.prompts, index, "down"))}>
                <ArrowDown className="size-3.5" />
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${itemWord.toLowerCase()} ${index + 1}`}
              disabled={group.prompts.length <= 1}
              onClick={() =>
                onChange((g) => {
                  const [removed] = g.prompts.splice(index, 1);
                  delete g.matchAnswers[removed.id];
                })
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange((g) => {
              const used = new Set(g.prompts.map((p) => p.id));
              let n = g.prompts.length + 1;
              while (used.has(`p${n}`)) n++;
              g.prompts.push({ id: `p${n}`, text: "" });
            })
          }
          data-testid="add-prompt"
        >
          <Plus className="size-3.5" /> Add {itemWord.toLowerCase()}
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{listWord}</p>
        {group.options.map((option, index) => (
          <div key={option.id} className="flex items-center gap-2" data-testid="matching-option">
            <span className="w-8 text-sm font-medium">{option.id}</span>
            <input className={FIELD} aria-label={`Option ${option.id} text`} value={option.text} placeholder={headings ? "Heading text" : "Option text"} onChange={(event) => onChange((g) => void (g.options[index].text = event.target.value))} data-testid="option-text" />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove option ${option.id}`} disabled={group.options.length <= 2} onClick={() => onChange((g) => relabel(g, index))}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => onChange((g) => void g.options.push({ id: optionLabel(g.kind, g.options.length), text: "" }))} data-testid="add-option">
          <Plus className="size-3.5" /> Add option
        </Button>
        {group.kind === "DIAGRAM_LABELLING" && <p className="text-muted-foreground text-xs">Add the map, plan or diagram as a picture of this part (&quot;Pictures&quot; above), then give each label its letter.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Blanks inside a text: summary, notes, table
// ---------------------------------------------------------------------------------------------------------------------------------------------------

function BlanksEditor({ group, layout, domId, onChange }: { group: BuilderGroup; layout: GroupLayout; domId: string; onChange: Mutate }) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const blanks = countBlanks(group.text);
  const table = group.kind === "TABLE_COMPLETION";

  /** Puts a blank where the caret is (replacing any selected text). The teacher never types dots or numbers: the real number is written in on save. */
  function insertBlank() {
    const area = areaRef.current;
    const at = area ? area.selectionStart : group.text.length;
    const end = area ? area.selectionEnd : at;
    onChange((g) => {
      const before = g.text;
      g.text = `${g.text.slice(0, at)}{{}}${g.text.slice(end)}`;
      g.blanks = reconcileBlanks(before, g.text, g.blanks);
    });
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(at + 4, at + 4);
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium" htmlFor={`text-${domId}`}>
            {table ? "Table (one row per line, cells separated by |)" : "Text with blanks"}
          </label>
          <Button type="button" variant="outline" size="sm" onClick={insertBlank} data-testid="insert-blank">
            <Plus className="size-3.5" /> Insert blank
          </Button>
        </div>
        <textarea
          ref={areaRef}
          id={`text-${domId}`}
          className={`${FIELD} min-h-32 font-mono`}
          value={group.text}
          placeholder={table ? "Country | Capital | Population\nFrance | {{}} | 67 million" : "The study found that {{}} was the main cause of the change."}
          onChange={(event) =>
            onChange((g) => {
              const before = g.text;
              g.text = event.target.value;
              g.blanks = reconcileBlanks(before, g.text, g.blanks);
            })
          }
          data-testid="blanks-text"
        />
        <p className="text-muted-foreground text-xs">
          Click where an answer box belongs and press &quot;Insert blank&quot;: each <code>{"{{}}"}</code> is one answer box and one numbered question. They are numbered for you ({blanks} blank{blanks === 1 ? "" : "s"}
          {blanks > 0 ? ` = Question${blanks === 1 ? "" : "s"} ${layout.first}${blanks > 1 ? `–${layout.first + blanks - 1}` : ""}` : ""}).
        </p>
      </div>

      {blanks > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Answers</p>
          {Array.from({ length: blanks }, (_, index) => (
            <div key={index} className="flex items-center gap-2" data-testid="blank-answer-row">
              <NumberBadge first={layout.itemNumbers[index] ?? layout.first + index} />
              <div className="flex-1">
                <AnswerInput
                  aria-label={`Answer to question ${layout.itemNumbers[index] ?? layout.first + index}`}
                  answers={group.blanks[index] ?? []}
                  onChange={(answers) =>
                    onChange((g) => {
                      g.blanks = padBlanks(g.blanks, countBlanks(g.text));
                      g.blanks[index] = answers;
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Keeps each blank's answers with its blank when the text is edited: a blank added before others pushes their answers along, a blank removed
 * takes its answers with it (found from where the old and the new text first differ).
 */
function reconcileBlanks(oldText: string, newText: string, blanks: string[][]): string[][] {
  const oldCount = countBlanks(oldText);
  const newCount = countBlanks(newText);
  if (oldCount === newCount) return padBlanks(blanks, newCount);
  let at = 0;
  while (at < oldText.length && at < newText.length && oldText[at] === newText[at]) at++;
  const before = countBlanks(oldText.slice(0, at));
  const next = blanks.slice();
  if (newCount > oldCount) next.splice(before, 0, ...Array.from({ length: newCount - oldCount }, () => [] as string[]));
  else next.splice(before, oldCount - newCount);
  return padBlanks(next, newCount);
}

/** Keeps one list of answers per blank, however many blanks the text has now. */
function padBlanks(blanks: string[][], count: number): string[][] {
  const next = blanks.slice(0, Math.max(count, 0));
  while (next.length < count) next.push([]);
  return next;
}
