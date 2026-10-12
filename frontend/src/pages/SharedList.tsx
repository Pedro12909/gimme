import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormSheet } from "@/components/form-sheet";
import { ItemSummary } from "@/components/item-summary";
import {
  ListControls,
  MIN_ITEMS_FOR_CONTROLS,
} from "@/components/list-controls";
import { PageShell } from "@/components/page-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Wordmark } from "@/components/wordmark";
import {
  ApiError,
  claimItem,
  getSharedList,
  unclaimItem,
  type SharedItem,
} from "@/lib/guest-api";
import {
  forgetClaimSecret,
  getClaimerName,
  getClaimSecret,
  saveClaimerName,
  saveClaimSecret,
} from "@/lib/guest-storage";
import {
  applyView,
  collectTags,
  DEFAULT_VIEW,
  itemLabel,
  type ListView,
} from "@/lib/item-view";

const MAX_NAME_LENGTH = 50;

export default function SharedList() {
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState<SharedItem>();
  const [view, setView] = useState<ListView>(DEFAULT_VIEW);

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

  const items = useMemo(() => list?.items ?? [], [list]);
  const tags = useMemo(() => collectTags(items), [items]);
  // Items arrive in the owner's order; available ones come first whichever sort is chosen
  const shown = useMemo(
    () => applyView(items, view, { claimedLast: true }),
    [items, view],
  );

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
    <PageShell header={header}>
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {list.title}
      </h1>
      {list.description && (
        <p className="mt-2 text-muted-foreground text-pretty">
          {list.description}
        </p>
      )}

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nothing on this list yet.
        </p>
      ) : (
        <>
          {items.length >= MIN_ITEMS_FOR_CONTROLS && (
            <div className="mt-8">
              <ListControls
                view={view}
                onChange={setView}
                tags={tags}
                rankingLabel="List order"
                showAvailableFilter
                shownCount={shown.length}
                totalCount={items.length}
              />
            </div>
          )}

          {shown.length > 0 ? (
            <ul className="mt-4 divide-y border-y">
              {shown.map((item) => (
                <ItemRow
                  key={item.itemId}
                  item={item}
                  onClaim={() => setClaiming(item)}
                  onUnclaim={() => unclaim.mutate(item)}
                  unclaiming={
                    unclaim.isPending &&
                    unclaim.variables?.itemId === item.itemId
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No items match.
            </p>
          )}
        </>
      )}

      <ClaimSheet
        token={token}
        item={claiming}
        onClose={() => setClaiming(undefined)}
        onClaimed={refresh}
      />
    </PageShell>
  );
}

function ItemRow({
  item,
  onClaim,
  onUnclaim,
  unclaiming,
}: {
  item: SharedItem;
  onClaim: () => void;
  onUnclaim: () => void;
  unclaiming: boolean;
}) {
  const mine = item.claimed && getClaimSecret(item.itemId) !== undefined;
  const status = mine
    ? "Claimed by you"
    : item.claimerName
      ? `Claimed by ${item.claimerName}`
      : "Claimed";

  return (
    <li className="flex items-center gap-3 py-3">
      <ItemSummary item={item} linkName dimmed={item.claimed}>
        {item.claimed && (
          <p className="mt-0.5 text-sm text-muted-foreground">{status}</p>
        )}
      </ItemSummary>

      {!item.claimed && (
        <Button variant="outline" size="lg" onClick={onClaim}>
          Claim
        </Button>
      )}
      {mine && (
        <Button
          variant="ghost"
          size="lg"
          onClick={onUnclaim}
          disabled={unclaiming}
        >
          Unclaim
        </Button>
      )}
    </li>
  );
}

function ClaimSheet({
  token,
  item,
  onClose,
  onClaimed,
}: {
  token: string;
  item: SharedItem | undefined;
  onClose: () => void;
  onClaimed: () => void;
}) {
  const [name, setName] = useState(getClaimerName);

  const claim = useMutation({
    mutationFn: (target: SharedItem) =>
      claimItem(token, target.itemId, name.trim()),
    onSuccess: ({ claimSecret }, target) => {
      saveClaimSecret(target.itemId, claimSecret);
      saveClaimerName(name.trim());
      toast(`You claimed ${itemLabel(target)}`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        toast.error("Someone else just claimed this");
        onClose();
      } else {
        toast.error("Couldn't claim this item. Try again.");
      }
    },
    onSettled: onClaimed,
  });

  return (
    <FormSheet
      open={item !== undefined}
      onOpenChange={(open) => !open && onClose()}
      title={<>Claim {item && itemLabel(item)}</>}
      description="Other guests will see it's taken. The list owner won't."
      submitLabel="Claim"
      submitting={claim.isPending}
      onSubmit={() => item && claim.mutate(item)}
    >
      <div className="grid gap-2">
        <Label htmlFor="claimer-name">Your name (optional)</Label>
        <Input
          id="claimer-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="given-name"
          className="h-11 text-base"
        />
      </div>
    </FormSheet>
  );
}
