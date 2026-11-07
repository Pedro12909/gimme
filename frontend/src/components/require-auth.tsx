import { Navigate, useLocation } from "react-router";
import { PageSkeleton } from "@/components/skeleton";
import { useAuth } from "@/lib/use-auth";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useAuth();
  const location = useLocation();

  if (isPending) return <PageSkeleton />;
  if (!user) {
    // Come back here after signing in, query included (a link shared into the app lives there)
    return (
      <Navigate
        to="/sign-in"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return children;
}
