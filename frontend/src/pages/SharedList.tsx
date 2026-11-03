import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClaimSheet } from "@/components/claim-sheet";
import {
  GuestListView,
  WhoseList,
  type GuestActions,
} from "@/components/guest-list-view";
import { PageShell, Wordmark } from "@/components/page-shell";
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
    refetch,
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
    onSuccess: (_, item) => forgetClaimSecret(item.itemId),
    onError: (err, item) => {
      // The claim is gone or no longer ours, so the stored secret is useless
      if (err instanceof ApiError && err.status === 403) {
        forgetClaimSecret(item.itemId);
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
    unclaimFailedId:
      unclaim.isError &&
      !(unclaim.error instanceof ApiError && unclaim.error.status === 403)
        ? unclaim.variables?.itemId
        : undefined,
    isMine: (item) => getClaimSecret(item.itemId) !== undefined,
  };

  const header = (
    <>
      {/* Also a way in for guests who want a list of their own */}
      <Wordmark />
      <WhoseList ownerName={list?.ownerName} />
    </>
  );

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;

    return (
      <PageShell header={header}>
        <h1 className="page-title">
          {notFound ? "This link doesn't work" : "Something went wrong"}
        </h1>
        <p className="mt-4 max-w-[560px] text-[15px]">
          {notFound
            ? "The list may have been deleted or shared with a new link. Ask for a fresh one."
            : "Check your connection and try again."}
        </p>
        {!notFound && (
          <button
            type="button"
            className="action mt-2"
            onClick={() => refetch()}
          >
            Try again
          </button>
        )}
      </PageShell>
    );
  }

  if (!list) return <PageShell header={header}>{null}</PageShell>;

  return (
    <PageShell header={header}>
      <GuestListView
        list={list}
        items={items}
        actions={actions}
        view={view}
        onViewChange={setView}
        notice={
          // Stays in place after revealing, so the list doesn't jump and claims can be hidden again
          ownList && (
            <p className="text-sm text-muted">
              {claims === "hidden" &&
                "This is your list, so claims are hidden to keep the surprise. "}
              {claims === "asking" &&
                "You'll see what's taken, and by whom if they left a name. "}
              {/* With nothing claimed the list looks the same as before, so say so */}
              {claims === "shown" &&
                (claimedCount === 0
                  ? "This is your list. Nobody has claimed anything yet. "
                  : `This is your list: ${claimedCount} of ${items.length} claimed. `)}
              <span className="inline-flex gap-x-4">
                <button
                  type="button"
                  className="action text-ink"
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
                  {claims === "hidden" && "Show them anyway"}
                  {claims === "asking" && "Show claims"}
                  {claims === "shown" && "Hide claims"}
                </button>
                {claims === "asking" && (
                  <button
                    type="button"
                    className="action text-ink"
                    onClick={() => setClaims("hidden")}
                  >
                    Keep them hidden
                  </button>
                )}
              </span>
            </p>
          )
        }
      />

      <ClaimSheet
        // While claims are hidden the owner only walks through the steps: a real attempt
        // could give away that something is already taken
        token={claimsHidden ? undefined : token}
        item={claiming}
        ownerName={list.ownerName}
        onClose={() => setClaiming(undefined)}
        onClaimed={refresh}
      />
    </PageShell>
  );
}
