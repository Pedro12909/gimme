import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { EyeIcon } from "lucide-react";
import { toast } from "sonner";
import { FormSheet } from "@/components/form-sheet";
import { ItemHeadline, ShopButton } from "@/components/guest-list-view";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, claimItem, type SharedItem } from "@/lib/guest-api";
import {
  getClaimerName,
  saveClaimerName,
  saveClaimSecret,
} from "@/lib/guest-storage";
import { useJustChanged } from "@/lib/use-just-changed";

const MAX_NAME_LENGTH = 50;

// Owners can't claim on their own list, but they're the ones relatives phone to ask how it
// works. So they can walk through the same two steps, with nothing claimed at the end.
function PreviewNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border p-3 text-sm text-pretty">
      <EyeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      {children}
    </p>
  );
}

export function ClaimSheet({
  token,
  item,
  onClose,
  onClaimed,
}: {
  // The list's share token. Without one this is the owner's preview: the steps are shown,
  // nothing is sent and nothing is claimed.
  token?: string;
  item: SharedItem | undefined;
  onClose: () => void;
  onClaimed?: () => void;
}) {
  const preview = token === undefined;
  const [name, setName] = useState(getClaimerName);
  // The item just claimed: the sheet stays open to point at the next step, buying it
  const [claimed, setClaimed] = useState<SharedItem>();
  // "Go to shop" appears where Claim was; a double tap shouldn't open the shop
  const tooSoon = useJustChanged(claimed?.itemId);

  const claim = useMutation({
    mutationFn: async (target: SharedItem) =>
      token === undefined
        ? undefined
        : claimItem(token, target.itemId, name.trim()),
    onSuccess: (result, target) => {
      if (result) {
        saveClaimSecret(target.itemId, result.claimSecret);
        saveClaimerName(name.trim());
      }
      setClaimed(target);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        // Claimed by someone else just now, or the owner already got it
        toast.error("This isn't available anymore");
        onClose();
      } else {
        toast.error("Couldn't claim this item. Try again.");
      }
    },
    onSettled: onClaimed,
  });

  const close = () => {
    setClaimed(undefined);
    onClose();
  };

  if (claimed && item?.itemId === claimed.itemId) {
    return (
      <ResponsiveModal
        open
        onOpenChange={(open) => !open && close()}
        title="You've claimed it"
        description="Other guests now see it's taken. The person who made this list doesn't."
        autoFocus={false}
        footer={
          <>
            <Button
              variant="outline"
              size="lg"
              className="h-11 flex-1 sm:h-9 sm:flex-none"
              onClick={close}
            >
              Done
            </Button>
            <ShopButton
              item={claimed}
              variant="default"
              onClick={(event) => tooSoon() && event.preventDefault()}
              className="h-11 flex-1 sm:h-9 sm:flex-none"
            />
          </>
        }
      >
        <div className="grid gap-4">
          {preview && (
            <PreviewNote>
              This is what a guest sees next. Nothing was claimed.
            </PreviewNote>
          )}
          <ItemHeadline item={claimed} />
          {/* The claim secret lives in this browser only */}
          <p className="text-sm text-muted-foreground text-pretty">
            Changed your mind? You can unclaim it from this list, on this
            device.
          </p>
        </div>
      </ResponsiveModal>
    );
  }

  return (
    <FormSheet
      open={item !== undefined}
      onOpenChange={(open) => !open && close()}
      title="Claim this gift"
      description="Other guests will see it's taken. The person who made this list won't."
      submitLabel="Claim"
      submitting={claim.isPending}
      onSubmit={() => item && claim.mutate(item)}
      // The name is optional, so don't open the phone keyboard over the item being claimed
      autoFocus={false}
    >
      {preview && (
        <PreviewNote>
          This is what a guest sees. Try it: nothing gets claimed.
        </PreviewNote>
      )}
      {/* The full name, photo and price, so the guest can see exactly what they're committing to */}
      {item && <ItemHeadline item={item} />}
      <div className="grid gap-2">
        <Label htmlFor="claimer-name">Your name (optional)</Label>
        <Input
          id="claimer-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="given-name"
          aria-describedby="claimer-name-hint"
          className="h-11 text-base"
        />
        {/* Guests held back from typing a name, unsure who would read it */}
        <p id="claimer-name-hint" className="text-sm text-muted-foreground">
          Other guests see it next to this gift.
        </p>
      </div>
    </FormSheet>
  );
}
