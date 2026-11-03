import { useLayoutEffect, useRef } from "react";

// After a claim or unclaim, a different button appears where the finger just was. A quick
// second tap would hit it (unclaim, then claim again). Clicks are ignored for a moment after
// `value` changes. Returns a function, so it's checked at click time with no timers.
//
// A layout effect, not a plain effect: it runs in the same step that puts the new button on
// screen, before any click can be handled. A plain effect runs later, leaving a gap in which
// a tap would get through.
export function useJustChanged(value: unknown, ms = 700) {
  const previous = useRef(value);
  const changedAt = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      changedAt.current = performance.now();
    }
  }, [value]);

  return () =>
    changedAt.current !== undefined &&
    performance.now() - changedAt.current < ms;
}
