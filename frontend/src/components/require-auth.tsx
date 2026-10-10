import { Navigate, useLocation } from "react-router";
import { useAuth } from "@/lib/use-auth";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useAuth();
  const location = useLocation();

  if (isPending) return null;
  if (!user) {
    // Come back here after signing in
    return (
      <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
    );
  }

  return children;
}
