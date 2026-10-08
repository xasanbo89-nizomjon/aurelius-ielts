"use client";

import {
  SHOW_RESULTS_HELP_NO,
  SHOW_RESULTS_HELP_YES,
  SHOW_RESULTS_QUESTION,
} from "@/lib/exam/result-visibility-rules";

/**
 * Phase O - the teacher's required answer to "Show results to students?" Yes / No, drawn the same way in every place a test is made or edited (the New test form, the
 * PDF import's confirm step, the Writing test form, the Writing task editor, the test's details). Nothing is chosen for the teacher: until one of the two is picked the
 * form refuses to go on, and says so here.
 */
export function ShowResultsField({
  value,
  onChange,
  error,
  disabled,
  name = "showResultsToStudent",
}: {
  value: boolean | null | undefined;
  onChange: (next: boolean) => void;
  error?: string;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <fieldset className="border-border/70 space-y-3 rounded-xl border px-4 py-3.5" data-testid="show-results-field" aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="px-1 text-sm font-medium">
        {SHOW_RESULTS_QUESTION} <span className="text-destructive" aria-hidden="true">*</span>
      </legend>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="radio" name={name} value="yes" checked={value === true} onChange={() => onChange(true)} disabled={disabled} className="mt-1" data-testid="show-results-yes" />
        <span>
          <span className="font-medium">Yes</span>
          <span className="text-muted-foreground block text-xs">{SHOW_RESULTS_HELP_YES}</span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="radio" name={name} value="no" checked={value === false} onChange={() => onChange(false)} disabled={disabled} className="mt-1" data-testid="show-results-no" />
        <span>
          <span className="font-medium">No</span>
          <span className="text-muted-foreground block text-xs">{SHOW_RESULTS_HELP_NO}</span>
        </span>
      </label>
      {error && (
        <p id={`${name}-error`} role="alert" className="text-destructive text-xs" data-testid="show-results-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
