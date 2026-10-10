import { useQuery } from "@tanstack/react-query";
import { currentUser } from "@/lib/auth";

export const authQueryKey = ["auth"];

export function useAuth() {
  const { data: user, isPending } = useQuery({
    queryKey: authQueryKey,
    queryFn: currentUser,
    staleTime: Infinity,
  });

  return { user: user ?? null, isPending };
}
