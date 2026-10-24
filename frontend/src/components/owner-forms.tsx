import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormSheet } from "@/components/form-sheet";
import { Input } from "@/components/ui/input";
import {
  ChevronRightIcon,
  ImagePlusIcon,
  Loader2Icon,
  PlusIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { ItemThumbnail } from "@/components/item-thumbnail";
import { TagInput } from "@/components/tag-input";
import { ToggleRow } from "@/components/toggle-row";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { withCurrency } from "@/lib/item-view";
import { previewLink, type ItemInput, type ListInput } from "@/lib/owner-api";
import { safeHref, siteName } from "@/lib/links";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";

// Limits match the owner Lambda's validation
const LIMITS = {
  listTitle: 100,
  description: 500,
  itemTitle: 200,
  note: 500,
  url: 2048,
  vendor: 60,
  size: 60,
  price: 32,
};

const fieldClass = "h-11 text-base";
const textareaClass = "min-h-20 text-base";

// Form state resets each time the sheet opens, so a cancelled edit never leaks into the next one
function useFormState<T>(open: boolean, initial: T) {
  const [values, setValues] = useState(initial);

  useEffect(() => {
    if (open) setValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when opening
  }, [open]);

  const set = <K extends keyof T>(key: K, value: T[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  return [values, set] as const;
}

export function ListFormSheet({
  open,
  onOpenChange,
  heading,
  submitLabel,
  initial = { title: "", description: "", eventDate: "", isPrivate: false },
  submitting,
  onSave,
  autoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heading: string;
  submitLabel: string;
  initial?: ListInput;
  submitting: boolean;
  onSave: (input: ListInput) => void;
  autoFocus?: boolean;
}) {
  const [values, set] = useFormState(open, initial);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={heading}
      submitLabel={submitLabel}
      submitting={submitting}
      autoFocus={autoFocus}
      canSubmit={values.title.trim() !== ""}
      onSubmit={() =>
        onSave({
          title: values.title.trim(),
          description: values.description.trim(),
          eventDate: values.eventDate,
          isPrivate: values.isPrivate,
        })
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="list-title">Name</Label>
        <Input
          id="list-title"
          placeholder="Birthday, Christmas, new flat…"
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
          maxLength={LIMITS.listTitle}
          autoComplete="off"
          className={fieldClass}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="list-date">Date (optional)</Label>
        {/* Guests see when they need the gift by; lists with dates coming up are listed first */}
        <div className="flex gap-2">
          <Input
            id="list-date"
            type="date"
            value={values.eventDate}
            onChange={(event) => set("eventDate", event.target.value)}
            className={cn(fieldClass, "flex-1")}
          />
          {values.eventDate && (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="size-11 shrink-0"
              aria-label="Clear date"
              onClick={() => set("eventDate", "")}
            >
              <XIcon />
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="list-description">Note for guests (optional)</Label>
        <Textarea
          id="list-description"
          value={values.description}
          onChange={(event) => set("description", event.target.value)}
          maxLength={LIMITS.description}
          className={textareaClass}
        />
      </div>
      <ToggleRow
        label="Keep private"
        description="Only you can see it. The share link stops working until you turn this off."
        checked={values.isPrivate}
        onChange={(isPrivate) => set("isPrivate", isPrivate)}
      />
    </FormSheet>
  );
}

// Text shared from shopping apps often wraps the link, e.g. "Kindle Paperwhite https://amzn.eu/d/abc",
// so a pasted message is reduced to the link inside it
function extractLink(text: string) {
  if (!/\s/.test(text.trim())) return text;
  return text.match(/https?:\/\/\S+/)?.[0] ?? text;
}

const MAX_ALTERNATIVES = 5;

const emptyItem: ItemInput = {
  url: "",
  title: "",
  note: "",
  imageUrl: "",
  price: "",
  vendor: "",
  size: "",
  alternatives: [],
  tags: [],
  starred: false,
  got: false,
};

// Fields the preview can fill in; each is only filled while the owner hasn't typed their own
type AutoField = "title" | "vendor" | "price";
const AUTO_FIELDS: AutoField[] = ["title", "vendor", "price"];

export function ItemFormSheet({
  open,
  onOpenChange,
  heading,
  submitLabel,
  initial = emptyItem,
  existingTags,
  currency = "",
  submitting,
  onSave,
  secondaryAction,
  autoFocus,
  prefillUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heading: string;
  submitLabel: string;
  initial?: ItemInput;
  // A new item's link, e.g. shared from a shop's app; unlike `initial`, it's previewed
  prefillUrl?: string;
  // Tags already used in this list, offered as suggestions
  existingTags: string[];
  // What most of the list's prices are in, e.g. "€"
  currency?: string;
  submitting: boolean;
  onSave: (input: ItemInput) => void;
  secondaryAction?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const [values, set] = useFormState(open, initial);
  // Runs after the form resets on opening
  useEffect(() => {
    if (open && prefillUrl) set("url", extractLink(prefillUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when opening
  }, [open, prefillUrl]);
  const url = values.url.trim();
  const urlValid = safeHref(url) !== undefined;
  // The button is never greyed out: pressing it with something missing says what, and where
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (open) setAttempted(false);
  }, [open]);
  const urlInput = useRef<HTMLInputElement>(null);
  // An empty link is only an error once they've tried to save without one
  const showUrlError = url === "" ? attempted : !urlValid;

  // Live preview: once a valid link has stopped changing, fetch its name, image, shop and price
  const debouncedUrl = useDebouncedValue(urlValid ? url : "", 400);
  const urlUnchanged = initial.url !== "" && url === initial.url;
  const preview = useQuery({
    queryKey: ["preview", debouncedUrl],
    queryFn: () => previewLink(debouncedUrl),
    enabled:
      open && debouncedUrl !== "" && debouncedUrl === url && !urlUnchanged,
    retry: false,
    staleTime: Infinity,
  });
  const fetched =
    !urlUnchanged && debouncedUrl === url ? preview.data : undefined;
  const previewing =
    urlValid && !urlUnchanged && (debouncedUrl !== url || preview.isFetching);
  const previewFailed =
    urlValid && !urlUnchanged && debouncedUrl === url && preview.isError;
  // Some shops give a name and nothing else, which looks the same as still loading
  const noPriceFound = fetched !== undefined && !fetched.price;
  const noPhotoFound = fetched !== undefined && !fetched.imageUrl;
  const notFound = [noPriceFound && "a price", noPhotoFound && "a photo"]
    .filter(Boolean)
    .join(" or ");

  // Editing without changing the link keeps the image saved with the item
  const linkImage = urlUnchanged ? initial.imageUrl : (fetched?.imageUrl ?? "");
  // A photo the owner picked themselves wins over the one that came with the link. Without
  // it, a shop that blocks the preview (or has no photo) leaves the item with none.
  const [ownImage, setOwnImage] = useState("");
  useEffect(() => {
    if (open) setOwnImage("");
  }, [open]);
  const ownImageUrl = ownImage.trim();
  // https only, like the API: guests see it on an https page
  const ownImageError =
    ownImageUrl !== "" && !safeHref(ownImageUrl)?.startsWith("https://");
  const imageUrl = (!ownImageError && ownImageUrl) || linkImage;

  // Values last filled in by the preview: a field still holding one of these hasn't been
  // touched by the owner, so a newer preview may replace it
  const [autoFilled, setAutoFilled] = useState<
    Partial<Record<AutoField, string>>
  >({});
  useEffect(() => {
    if (!open) return;
    // What an item was saved with came from its link, so it counts as filled in too: pasting
    // a different link replaces it, rather than leaving the old name on a new product
    setAutoFilled(
      initial.url === ""
        ? {}
        : {
            title: initial.title,
            vendor: initial.vendor,
            price: initial.price,
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when opening
  }, [open]);
  useEffect(() => {
    if (!fetched) return;
    const filled: Partial<Record<AutoField, string>> = {};
    for (const field of AUTO_FIELDS) {
      const next = fetched[field];
      if (
        next &&
        (values[field].trim() === "" || values[field] === autoFilled[field])
      ) {
        set(field, next);
        filled[field] = next;
      }
    }
    setAutoFilled((current) => ({ ...current, ...filled }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to new preview results only
  }, [fetched]);

  // A price typed as a bare number ("89,95") gets the currency the rest of the list uses.
  // Only once per number: taking the currency off again is the owner's call. A price the
  // item was saved with is left alone too.
  const currencyAddedTo = useRef("");
  useEffect(() => {
    if (open) currencyAddedTo.current = "";
  }, [open]);
  const completePrice = (typed: string) => {
    const price = typed.trim();
    if (price === initial.price || price === currencyAddedTo.current)
      return price;
    const completed = withCurrency(price, currency);
    if (completed !== price) currencyAddedTo.current = price;
    return completed;
  };

  // "More details" starts open when editing an item with other shops to show. The shop's
  // name alone doesn't open it: nearly every item has one, filled in from its link.
  const detailsSummary = [
    values.vendor.trim(),
    values.alternatives.filter((link) => link.trim()).length > 0
      ? "other shops"
      : "",
  ].filter(Boolean);
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    if (open) setDetailsOpen(initial.alternatives.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only decide when opening
  }, [open]);

  // The section sits at the bottom of the form, so on a phone it opens below the edge of
  // the sheet and nothing seems to happen. Bringing its heading to the top shows what opened.
  const detailsTrigger = useRef<HTMLButtonElement>(null);
  const showDetails = (show: boolean) => {
    setDetailsOpen(show);
    if (!show) return;
    // The fields only exist once the section has opened
    requestAnimationFrame(() =>
      detailsTrigger.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      }),
    );
  };

  // The photo beside the link is also the way to its field, which sits in "More details"
  const photoInput = useRef<HTMLInputElement>(null);
  const editPhoto = () => {
    setDetailsOpen(true);
    // The field only exists once the section has opened
    requestAnimationFrame(() => photoInput.current?.focus());
  };

  const alternativeErrors = values.alternatives.map(
    (link) => link.trim() !== "" && safeHref(link.trim()) === undefined,
  );
  const setAlternative = (index: number, link: string) =>
    set(
      "alternatives",
      values.alternatives.map((existing, i) =>
        i === index ? extractLink(link) : existing,
      ),
    );

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={heading}
      submitLabel={submitLabel}
      submitting={submitting}
      onSubmit={() => {
        if (!urlValid) {
          setAttempted(true);
          urlInput.current?.focus();
          return;
        }
        // These fields show their own message; they may be folded away
        if (ownImageError || alternativeErrors.some(Boolean)) {
          showDetails(true);
          return;
        }
        onSave({
          url,
          title: values.title.trim(),
          note: values.note.trim(),
          imageUrl,
          // Enter in the price field saves without leaving it
          price: completePrice(values.price),
          vendor: values.vendor.trim(),
          size: values.size.trim(),
          alternatives: values.alternatives
            .map((link) => link.trim())
            .filter(Boolean),
          tags: values.tags,
          starred: values.starred,
          got: values.got,
        });
      }}
      secondaryAction={secondaryAction}
      autoFocus={autoFocus}
    >
      <div className="grid gap-2">
        <Label htmlFor="item-url">Link</Label>
        {/* The photo has a fixed slot beside the link, so the form never changes height
            while a preview loads and nothing slides under the owner's finger */}
        <div className="flex gap-2">
          <Input
            ref={urlInput}
            id="item-url"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={values.url}
            onChange={(event) => set("url", extractLink(event.target.value))}
            maxLength={LIMITS.url}
            autoComplete="off"
            aria-invalid={showUrlError}
            aria-describedby={showUrlError ? "item-url-error" : undefined}
            className={fieldClass}
          />
          {/* After the link in the markup, so opening the form still puts the cursor in the link */}
          <button
            type="button"
            onClick={editPhoto}
            aria-label={imageUrl ? "Change photo" : "Add a photo"}
            className="order-first shrink-0 rounded-md"
          >
            {previewing ? (
              <span className="flex size-11 items-center justify-center rounded-md bg-muted">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              </span>
            ) : imageUrl ? (
              <ItemThumbnail src={imageUrl} className="size-11" />
            ) : (
              // An empty slot that asks to be filled, rather than a stand-in picture
              <span className="flex size-11 items-center justify-center rounded-md border border-dashed border-muted-foreground/40 text-muted-foreground">
                <ImagePlusIcon className="size-5" />
              </span>
            )}
          </button>
        </div>
        {showUrlError && (
          <p id="item-url-error" className="text-sm text-destructive">
            {url === ""
              ? "An item needs a link. Paste one from any shop."
              : "Paste a full link, starting with https://"}
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {previewing
            ? "Fetching details"
            : previewFailed
              ? "Couldn't get details from this shop"
              : notFound
                ? `The shop didn't give ${notFound}`
                : ""}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="item-title">Name (optional)</Label>
        <Input
          id="item-title"
          // Said here rather than under the link, so the message doesn't push the form down
          placeholder={
            previewing
              ? "Getting details from the shop…"
              : previewFailed
                ? "Couldn't get it from the shop. Add one here."
                : ""
          }
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
          maxLength={LIMITS.itemTitle}
          autoComplete="off"
          className={fieldClass}
        />
      </div>

      {/* What guests need to buy the right thing, so these two aren't folded away */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="item-price">Price (optional)</Label>
          <Input
            id="item-price"
            // Otherwise an empty price after loading looks like it's still on its way
            placeholder={noPriceFound ? "Not found, add it" : "e.g. €19.99"}
            value={values.price}
            onChange={(event) => set("price", event.target.value)}
            onBlur={() => set("price", completePrice(values.price))}
            maxLength={LIMITS.price}
            autoComplete="off"
            className={fieldClass}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="item-size">Size (optional)</Label>
          <Input
            id="item-size"
            placeholder="e.g. M, EU 42, blue"
            value={values.size}
            onChange={(event) => set("size", event.target.value)}
            maxLength={LIMITS.size}
            autoComplete="off"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid gap-3">
        <ToggleRow
          label={
            <>
              <StarIcon className="size-3.5 fill-current" />
              Really want this
            </>
          }
          description="Starred items stand out for you and your guests."
          checked={values.starred}
          onChange={(starred) => set("starred", starred)}
        />
        {/* Only once it's on the list: nobody adds something they already have */}
        {initial.url !== "" && (
          <ToggleRow
            label="Got it"
            description="Bought or received. Guests see it's no longer needed."
            checked={values.got}
            onChange={(got) => set("got", got)}
          />
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="item-tags">Tags (optional)</Label>
        <TagInput
          id="item-tags"
          value={values.tags}
          onChange={(tags) => set("tags", tags)}
          suggestions={existingTags}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="item-note">Note (optional)</Label>
        <Textarea
          id="item-note"
          placeholder="Anything that helps, e.g. gift wrap please"
          value={values.note}
          onChange={(event) => set("note", event.target.value)}
          maxLength={LIMITS.note}
          className={textareaClass}
        />
      </div>

      <Collapsible open={detailsOpen} onOpenChange={showDetails}>
        <CollapsibleTrigger
          ref={detailsTrigger}
          className="flex w-full items-center gap-2 rounded-md py-1 text-left text-sm font-medium"
        >
          <ChevronRightIcon
            className={cn(
              "size-4 transition-transform",
              detailsOpen && "rotate-90",
            )}
          />
          More details
          {!detailsOpen && detailsSummary.length > 0 && (
            <span className="min-w-0 truncate font-normal text-muted-foreground">
              · {detailsSummary.join(" · ")}
            </span>
          )}
        </CollapsibleTrigger>

        <CollapsibleContent className="grid gap-5 pt-4">
          <div className="grid gap-2">
            <Label htmlFor="item-vendor">Shop</Label>
            <Input
              id="item-vendor"
              placeholder={urlValid ? siteName(url) : "e.g. Amazon"}
              value={values.vendor}
              onChange={(event) => set("vendor", event.target.value)}
              maxLength={LIMITS.vendor}
              autoComplete="off"
              className={fieldClass}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="item-image">Photo</Label>
            <Input
              ref={photoInput}
              id="item-image"
              type="url"
              inputMode="url"
              placeholder={
                previewing
                  ? "Getting it from the shop…"
                  : linkImage
                    ? "Paste a link to another photo"
                    : noPhotoFound
                      ? "Not found. Paste an image link"
                      : "Paste an image link"
              }
              value={ownImage}
              onChange={(event) => setOwnImage(extractLink(event.target.value))}
              maxLength={LIMITS.url}
              autoComplete="off"
              aria-invalid={ownImageError}
              aria-describedby={ownImageError ? "item-image-error" : undefined}
              className={fieldClass}
            />
            {ownImageError && (
              <p id="item-image-error" className="text-sm text-destructive">
                Paste a full image link, starting with https://
              </p>
            )}
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              Other places to buy it
            </legend>
            {values.alternatives.map((link, index) => (
              <div key={index} className="grid gap-1">
                <div className="flex gap-2">
                  <Input
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    aria-label={`Other shop link ${index + 1}`}
                    value={link}
                    onChange={(event) =>
                      setAlternative(index, event.target.value)
                    }
                    maxLength={LIMITS.url}
                    autoComplete="off"
                    aria-invalid={alternativeErrors[index]}
                    className={fieldClass}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    className="size-11 shrink-0"
                    aria-label={`Remove other shop link ${index + 1}`}
                    onClick={() =>
                      set(
                        "alternatives",
                        values.alternatives.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <XIcon />
                  </Button>
                </div>
                {alternativeErrors[index] && (
                  <p className="text-sm text-destructive">
                    Paste a full link, starting with https://
                  </p>
                )}
              </div>
            ))}
            {values.alternatives.length < MAX_ALTERNATIVES && (
              <Button
                type="button"
                variant="outline"
                className="h-11 justify-start"
                onClick={() =>
                  set("alternatives", [...values.alternatives, ""])
                }
              >
                <PlusIcon />
                Add a link
              </Button>
            )}
          </fieldset>
        </CollapsibleContent>
      </Collapsible>
    </FormSheet>
  );
}
