import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Modal } from "@/components/modal";
import { TileSquare } from "@/components/tile";
import { ApiError, claimItem, type SharedItem } from "@/lib/guest-api";
import {
  getClaimerName,
  saveClaimerName,
  saveClaimSecret,
} from "@/lib/guest-storage";
import { itemLabel, itemMeta } from "@/lib/item-view";

const MAX_NAME_LENGTH = 50;

// A bottom sheet on phones, a panel on the right on wider screens
export function ClaimSheet({
  token,
  item,
  ownerName,
  onClose,
  onClaimed,
}: {
  // The list's share token. Without one this is the owner's preview: the steps are shown,
  // nothing is sent and nothing is claimed.
  token?: string;
  item: SharedItem | undefined;
  ownerName?: string;
  onClose: () => void;
  onClaimed?: () => void;
}) {
  const headingId = useId();
  const [name, setName] = useState(getClaimerName);

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
      close();
    },
    onSettled: onClaimed,
  });

  const close = () => {
    claim.reset();
    onClose();
  };

  // Claimed by someone else a moment ago, or the owner already got it
  const gone = claim.error instanceof ApiError && claim.error.status === 409;
  const meta = item && itemMeta(item);

  return (
    <Modal
      open={item !== undefined}
      onClose={close}
      labelledBy={headingId}
      className="inset-x-0 top-auto bottom-0 max-h-[90svh] w-full max-w-none border-t border-ink bg-field sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:max-h-none sm:w-[440px] sm:border-t-0 sm:border-l sm:border-hairline"
    >
      {item && (
        <div className="px-4 pt-6 pb-[max(32px,env(safe-area-inset-bottom))] sm:px-7 sm:pt-7">
          {token === undefined && (
            <p className="mb-5 text-[13px] text-muted">
              This is what a guest sees. Nothing gets claimed.
            </p>
          )}

          <div className="flex items-center gap-3.5">
            <TileSquare
              imageUrl={item.imageUrl}
              className="w-16 shrink-0 border border-hairline"
            />
            <div className="min-w-0">
              <h2
                id={headingId}
                className="line-clamp-3 text-lg leading-tight font-medium"
              >
                {itemLabel(item)}
              </h2>
              {meta && <p className="mt-0.5 text-[13px] text-muted">{meta}</p>}
            </div>
          </div>

          {gone ? (
            <div className="mt-6">
              <p className="text-[15px]">
                Someone else took this a moment ago.
              </p>
              <button
                type="button"
                className="action mt-2 w-full justify-center text-[15px]"
                onClick={close}
              >
                Close
              </button>
            </div>
          ) : (
            <form
              noValidate
              className="mt-[22px]"
              onSubmit={(event) => {
                event.preventDefault();
                claim.mutate(item);
              }}
            >
              <label
                htmlFor="claimer-name"
                className="block text-[13px] text-muted"
              >
                Your name, optional
              </label>
              <input
                id="claimer-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={MAX_NAME_LENGTH}
                autoComplete="given-name"
                aria-describedby="claimer-name-hint"
                className="field mt-1.5"
              />
              {/* Guests held back from typing a name, unsure who would read it */}
              <p
                id="claimer-name-hint"
                className="mt-2 text-[13px] leading-[1.45] text-muted"
              >
                Other guests will see it.{" "}
                {ownerName ?? "The person who made this list"} won't. You can
                undo it later on this device.
              </p>
              {claim.isError && (
                <p role="alert" className="mt-3 text-[13px] font-medium">
                  Couldn't claim it. Try again.
                </p>
              )}
              <button
                type="submit"
                className="submit mt-[18px] min-h-[52px] w-full text-base"
                disabled={claim.isPending}
              >
                {claim.isPending ? "One moment…" : "I'll get this"}
              </button>
              <button
                type="button"
                className="action mt-2 w-full justify-center text-[15px]"
                onClick={close}
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
