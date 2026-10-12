import { useQueryClient } from "@tanstack/react-query";
import { CircleUserIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth";
import { authQueryKey, useAuth } from "@/lib/use-auth";

// Sign-out is rare, so it lives behind the account icon, next to the email it applies to
export function AccountMenu() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    // Leave the signed-in pages first, or the auth guard would bounce to /sign-in instead
    navigate("/", { replace: true });
    // clear() alone drops the cache without telling mounted components, so the signed-in
    // user stayed on screen until a refresh. Setting it to null notifies them.
    queryClient.clear();
    queryClient.setQueryData(authQueryKey, null);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-lg" aria-label="Account">
          <CircleUserIcon className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {user?.signInDetails?.loginId && (
          <>
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {user.signInDetails.loginId}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={handleSignOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
