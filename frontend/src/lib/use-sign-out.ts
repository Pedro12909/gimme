import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { signOut } from "@/lib/auth";
import { authQueryKey } from "@/lib/use-auth";

export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async () => {
    await signOut();
    // Leave the signed-in pages first, or the auth guard would bounce to /sign-in instead
    navigate("/", { replace: true });
    // clear() alone drops the cache without telling mounted components, so the signed-in
    // user stayed on screen until a refresh. Setting it to null notifies them.
    queryClient.clear();
    queryClient.setQueryData(authQueryKey, null);
  };
}
