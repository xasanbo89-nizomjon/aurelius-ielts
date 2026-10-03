"use client";

import { useRef } from "react";

/**
 * Returns the PREVIOUS value while `equals` says nothing really changed.
 *
 * The exam recomputes "which questions are answered?" on every keystroke, but
 * the answer to that only changes when a box goes from empty to non-empty (or
 * back) — typing the 2nd letter of a word changes nothing. Handing the
 * navigation bars the same array reference in the meantime lets React skip
 * re-rendering their 40+ buttons for every key the student presses.
 */
export function useStableValue<T>(value: T, equals: (previous: T, next: T) => boolean): T {
  const ref = useRef(value);
  if (ref.current !== value && !equals(ref.current, value)) ref.current = value;
  return ref.current;
}
