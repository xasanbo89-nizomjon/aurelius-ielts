/**
 * The review page draws its two panels twice (once for the desktop split, once for the phone's tabs; CSS hides one), so a selector can match a hidden copy
 * first. This scrolls to the first match that is really on screen.
 */
export function scrollToVisible(selector: string, block: ScrollLogicalPosition = "center"): boolean {
  const target = [...document.querySelectorAll<HTMLElement>(selector)].find((node) => node.getClientRects().length > 0);
  target?.scrollIntoView({ behavior: "smooth", block });
  return Boolean(target);
}
