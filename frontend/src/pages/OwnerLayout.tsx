import { Outlet } from "react-router";
import { RequireAuth } from "@/components/require-auth";

// Wraps every signed-in page; loaded on demand so guests never download the auth code
export default function OwnerLayout() {
  return (
    <RequireAuth>
      <div className="mx-auto w-full max-w-xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
    </RequireAuth>
  );
}
