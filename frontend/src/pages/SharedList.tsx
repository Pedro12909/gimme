import { useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormSheet } from "@/components/form-sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { safeHref, siteName } from "@/lib/links";

const MAX_NAME_LENGTH = 50;

const itemLabel = (item: SharedItem) =>
  item.title?.trim() || siteName(item.url);

export default function SharedList() {
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState<SharedItem>();

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

  if (isPending) {
    return (
      <Page>
        <Skeleton className="h-8 w-2/3" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Page>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;

    return (
      <Page>
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
      </Page>
    );
  }

  // Available items first; claimed ones sink to the bottom, keeping the owner's order within each group
  const items = [...list.items].sort(
    (a, b) => Number(a.claimed) - Number(b.claimed),
  );

  return (
    <Page>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {list.title}
        </h1>
        {list.description && (
          <p className="mt-2 text-muted-foreground text-pretty">
            {list.description}
          </p>
        )}
      </header>

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nothing on this list yet.
        </p>
      ) : (
        <ul className="mt-8 divide-y border-y">
          {items.map((item) => (
            <ItemRow
              key={item.itemId}
              item={item}
              onClaim={() => setClaiming(item)}
              onUnclaim={() => unclaim.mutate(item)}
              unclaiming={
                unclaim.isPending && unclaim.variables?.itemId === item.itemId
              }
            />
          ))}
        </ul>
      )}

      <ClaimSheet
        token={token}
        item={claiming}
        onClose={() => setClaiming(undefined)}
        onClaimed={refresh}
      />
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative mx-auto w-full max-w-xl px-4 pt-14 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:pt-16">
      <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-2">
        <ThemeToggle />
      </div>
      {children}
    </main>
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
  const href = safeHref(item.url);
  const mine = item.claimed && getClaimSecret(item.itemId) !== undefined;
  const details = [
    item.title?.trim() ? siteName(item.url) : undefined,
    item.note,
  ]
    .filter(Boolean)
    .join(" · ");

  const status = mine
    ? "Claimed by you"
    : item.claimerName
      ? `Claimed by ${item.claimerName}`
      : "Claimed";

  return (
    <li className="flex items-center gap-4 py-4">
      <div
        className={
          item.claimed ? "min-w-0 flex-1 opacity-50" : "min-w-0 flex-1"
        }
      >
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-medium underline-offset-4 hover:underline"
          >
            {itemLabel(item)}
          </a>
        ) : (
          <p className="truncate font-medium">{itemLabel(item)}</p>
        )}
        {details && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {details}
          </p>
        )}
        {item.claimed && (
          <p className="mt-0.5 text-sm text-muted-foreground">{status}</p>
        )}
      </div>

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
