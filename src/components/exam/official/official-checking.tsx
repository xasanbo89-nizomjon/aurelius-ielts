/**
 * Phase M2 - what the student sees between pressing Submit and their results: the answers are being marked, then the review opens with the results dialog.
 * Drawn inside the exam screen (it follows the contrast setting) and over everything, so nothing can be typed while the test is being handed in.
 */
export function OfficialChecking() {
  return (
    <div className="ex-checking" role="status" aria-live="polite" data-testid="checking-overlay">
      <div className="ex-checking-spinner" aria-hidden="true" />
      <p>
        <strong>Checking your answers…</strong>
      </p>
    </div>
  );
}
