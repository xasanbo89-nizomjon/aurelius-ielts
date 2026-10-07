import "@/components/exam/official/official-exam.css";

/** Phase M2 - while the review is being prepared (straight after handing in this is the "Checking your answers..." the student has been looking at). */
export default function Loading() {
  return (
    <div className="ex-scope ex-checking" role="status" aria-live="polite" data-testid="checking-overlay">
      <div className="ex-checking-spinner" aria-hidden="true" />
      <p>
        <strong>Checking your answers…</strong>
      </p>
    </div>
  );
}
