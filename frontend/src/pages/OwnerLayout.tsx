import { Outlet } from "react-router";
import { RequireAuth } from "@/components/require-auth";

// Wraps every signed-in page; loaded on demand so guests never download the auth code
export default function OwnerLayout() {
  return (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  );
}
