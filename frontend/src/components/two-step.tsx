import { useEffect, useState } from "react";

// Remove item, Delete list: the first press turns the control into "Remove?" in danger red,
// a second press within 4 seconds confirms, and anything else (a click elsewhere, focus
// moving away, waiting) cancels. No modal.
export function useTwoStep(onConfirm: () => void, ms = 4000) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), ms);
    return () => clearTimeout(timer);
  }, [armed, ms]);

  return {
    armed,
    press: () => {
      if (armed) {
        setArmed(false);
        onConfirm();
      } else {
        setArmed(true);
      }
    },
    cancel: () => setArmed(false),
  };
}
