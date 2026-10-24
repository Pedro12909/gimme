import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { toast } from "sonner";
import { ClaimSheet } from "@/components/claim-sheet";
import { GuestListView, type GuestActions } from "@/components/guest-list-view";
import { PageShell } from "@/components/page-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Wordmark } from "@/components/wordmark";
import {
  ApiError,
  getSharedList,
  unclaimItem,
  type SharedItem,
} from "@/lib/guest-api";
import {
  forgetClaimSecret,
  getClaimSecret,
  isOwnShareToken,
} from "@/lib/guest-storage";
import { itemLabel } from "@/lib/item-view";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useListView } from "@/lib/use-list-view";

export default function SharedList() {
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState<SharedItem>();
  const [view, setView] = useListView(`share:${token}`);

  // An owner opening their own link sees it without claims, unless they choose otherwise.
  // Showing them can't be taken back once seen, so it's asked twice.
  const ownList = useMemo(() => isOwnShareToken(token), [token]);
  const [claims, setClaims] = useState<"hidden" | "asking" | "shown">("hidden");
  const claimsHidden = ownList && claims !== "shown";

  const queryKey = ["share", token];
  const {
    data: list,
    error,
    isPending,
  } = useQuery({
    queryKey,
    queryFn: () => getSharedList(token),
    retry: (count, err) =>
      !(err instanceof ApiError && err.status === 404) && count < 2,
  });
  useDocumentTitle(list?.title);

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const unclaim = useMutation({
    mutationFn: (item: SharedItem) =>
      unclaimItem(token, item.itemId, getClaimSecret(item.itemId) ?? ""),
    onSuccess: (_, item) => {
      forgetClaimSecret(item.itemId);
      toast(`${itemLabel(item)} is available again`);
    },
    onError: (err, item) => {
      if (err instanceof ApiError && err.status === 403) {
        // The claim is gone or no longer ours, so the stored secret is useless
        forgetClaimSecret(item.itemId);
        toast.error("This item was already released");
      } else {
        toast.error("Couldn't release this item. Try again.");
      }
    },
    onSettled: refresh,
  });

  const items = useMemo(() => {
    const all = list?.items ?? [];
    return claimsHidden
      ? all.map((item) => ({ ...item, claimed: false, claimerName: undefined }))
      : all;
  }, [list, claimsHidden]);
  const claimedCount = items.filter((item) => item.claimed).length;

  const actions: GuestActions = {
    onClaim: setClaiming,
    onUnclaim: (item) => unclaim.mutate(item),
    unclaimingId: unclaim.isPending ? unclaim.variables?.itemId : undefined,
    isMine: (item) => getClaimSecret(item.itemId) !== undefined,
  };

  const header = (
    <>
      {/* Also a way in for guests who want a list of their own */}
      <Wordmark />
      <ThemeToggle />
    </>
  );

  if (isPending) {
    return (
      <PageShell header={header}>
        <Skeleton className="h-8 w-2/3" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </PageShell>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;

    return (
      <PageShell header={header}>
        <div className="py-24 text-center">
          <h1 className="text-lg font-medium">
            {notFound ? "This link doesn't work" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {notFound
              ? "The list may have been deleted or shared with a new link. Ask for a fresh one."
              : "Check your connection and try again."}
          </p>
          {!notFound && (
            <Button variant="outline" className="mt-6" onClick={refresh}>
              Try again
            </Button>
          )}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell header={header} wide={view.layout === "grid"}>
      <GuestListView
        list={list}
        items={items}
        actions={actions}
        view={view}
        onViewChange={setView}
        notice={
          // Stays in place after revealing, so the list doesn't jump and claims can be hidden again
          ownList && (
            <div className="flex items-start gap-3 rounded-lg border p-4">
              {claimsHidden ? (
                <EyeOffIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              ) : (
                <EyeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="grid flex-1 gap-2">
                <p className="text-sm text-pretty">
                  {claims === "hidden" &&
                    "This is your list, so claims are hidden to keep the surprise."}
                  {claims === "asking" &&
                    "You'll see which gifts are taken, and who is getting them if they left a name."}
                  {/* With nothing claimed the list looks the same as before, so say so */}
                  {claims === "shown" &&
                    (claimedCount === 0
                      ? "This is your list. Nobody has claimed anything yet."
                      : `This is your list, and claims are showing: ${claimedCount} of ${items.length} claimed.`)}
                </p>
                <div className="flex gap-4">
                  {claims === "asking" && (
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => setClaims("hidden")}
                    >
                      Keep them hidden
                    </Button>
                  )}
                  <Button
                    variant="link"
                    className="h-auto p-0 text-muted-foreground"
                    onClick={() =>
                      setClaims(
                        claims === "hidden"
                          ? "asking"
                          : claims === "asking"
                            ? "shown"
                            : "hidden",
                      )
                    }
                  >
                    {claims === "hidden" && "Show claims anyway"}
                    {claims === "asking" && "Show claims"}
                    {claims === "shown" && "Hide claims"}
                  </Button>
                </div>
              </div>
            </div>
          )
        }
      />

      <ClaimSheet
        // While claims are hidden the owner only walks through the steps: a real attempt
        // could give away that something is already taken
        token={claimsHidden ? undefined : token}
        item={claiming}
        onClose={() => setClaiming(undefined)}
        onClaimed={refresh}
      />
    </PageShell>
  );
}
