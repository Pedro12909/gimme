import { useEffect } from "react";
import { Outlet } from "react-router";
import { RequireAuth } from "@/components/require-auth";

// Once a signed-in page is up, fetch the code for the others in the background. Moving
// between them then shows the next page (or its skeleton) at once, instead of waiting on
// a download with the old page still on screen.
const preloadOwnerPages = () =>
  Promise.all([
    import("@/pages/Home"),
    import("@/pages/ListSettings"),
    import("@/pages/ListPreview"),
    import("@/pages/Account"),
  ]).catch(() => {
    // Each page still loads on demand if this fails
  });

// Wraps every signed-in page; loaded on demand so guests never download the auth code
export default function OwnerLayout() {
  useEffect(() => {
    const timer = setTimeout(preloadOwnerPages, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  );
}
