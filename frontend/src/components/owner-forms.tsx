import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormSheet } from "@/components/form-sheet";
import { Input } from "@/components/ui/input";
import { ChevronRightIcon, PlusIcon, XIcon } from "lucide-react";
import { ItemThumbnail } from "@/components/item-thumbnail";
import { TagInput } from "@/components/tag-input";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  initial = { title: "", description: "" },
  submitting,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heading: string;
  submitLabel: string;
  initial?: ListInput;
  submitting: boolean;
  onSave: (input: ListInput) => void;
}) {
  const [values, set] = useFormState(open, initial);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={heading}
      submitLabel={submitLabel}
      submitting={submitting}
      canSubmit={values.title.trim() !== ""}
      onSubmit={() =>
        onSave({
          title: values.title.trim(),
          description: values.description.trim(),
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
        <Label htmlFor="list-description">Note for guests (optional)</Label>
        <Textarea
          id="list-description"
          value={values.description}
          onChange={(event) => set("description", event.target.value)}
          maxLength={LIMITS.description}
          className={textareaClass}
        />
      </div>
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
  submitting,
  onSave,
  secondaryAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heading: string;
  submitLabel: string;
  initial?: ItemInput;
  // Tags already used in this list, offered as suggestions
  existingTags: string[];
  submitting: boolean;
  onSave: (input: ItemInput) => void;
  secondaryAction?: React.ReactNode;
}) {
  const [values, set] = useFormState(open, initial);
  const url = values.url.trim();
  const urlValid = safeHref(url) !== undefined;
  // Only complain once something has been typed, never on an empty field
  const showUrlError = url !== "" && !urlValid;

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

  // Editing without changing the link keeps the image saved with the item
  const imageUrl = urlUnchanged ? initial.imageUrl : (fetched?.imageUrl ?? "");

  // Values last filled in by the preview: a field still holding one of these hasn't been
  // touched by the owner, so a newer preview may replace it
  const [autoFilled, setAutoFilled] = useState<
    Partial<Record<AutoField, string>>
  >({});
  useEffect(() => {
    if (open) setAutoFilled({});
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

  // "More details" starts open when editing an item that already has some
  const detailsSummary = [
    values.vendor.trim(),
    values.price.trim(),
    values.size.trim(),
    values.alternatives.filter((link) => link.trim()).length > 0
      ? "other shops"
      : "",
  ].filter(Boolean);
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    if (open) {
      setDetailsOpen(
        Boolean(
          initial.size ||
          initial.alternatives.length > 0 ||
          initial.price ||
          initial.vendor,
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only decide when opening
  }, [open]);

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
      canSubmit={urlValid && !alternativeErrors.some(Boolean)}
      onSubmit={() =>
        onSave({
          url,
          title: values.title.trim(),
          note: values.note.trim(),
          imageUrl,
          price: values.price.trim(),
          vendor: values.vendor.trim(),
          size: values.size.trim(),
          alternatives: values.alternatives
            .map((link) => link.trim())
            .filter(Boolean),
          tags: values.tags,
        })
      }
      secondaryAction={secondaryAction}
    >
      <div className="grid gap-2">
        <Label htmlFor="item-url">Link</Label>
        <Input
          id="item-url"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={values.url}
          onChange={(event) => set("url", extractLink(event.target.value))}
          maxLength={LIMITS.url}
          autoComplete="off"
          aria-invalid={showUrlError}
          aria-describedby={
            showUrlError
              ? "item-url-error"
              : previewFailed
                ? "item-url-preview"
                : undefined
          }
          className={fieldClass}
        />
        {showUrlError && (
          <p id="item-url-error" className="text-sm text-destructive">
            Paste a full link, starting with https://
          </p>
        )}

        {previewing ? (
          <div className="flex items-center gap-3" aria-live="polite">
            <Skeleton className="size-14 shrink-0 rounded-md" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-3/4" />
              <span className="sr-only">Fetching details</span>
              <Skeleton className="h-4 w-1/4" />
            </div>
          </div>
        ) : imageUrl ? (
          <ItemThumbnail src={imageUrl} />
        ) : previewFailed ? (
          <p id="item-url-preview" className="text-sm text-muted-foreground">
            Couldn't get details from this shop. Add a name below.
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="item-title">Name (optional)</Label>
        <Input
          id="item-title"
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
          maxLength={LIMITS.itemTitle}
          autoComplete="off"
          className={fieldClass}
        />
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

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md py-1 text-left text-sm font-medium">
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
          <div className="grid grid-cols-2 gap-3">
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
              <Label htmlFor="item-price">Price</Label>
              <Input
                id="item-price"
                placeholder="e.g. €19.99"
                value={values.price}
                onChange={(event) => set("price", event.target.value)}
                maxLength={LIMITS.price}
                autoComplete="off"
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="item-size">Size or variant</Label>
            <Input
              id="item-size"
              placeholder="e.g. M, EU 42, 256 GB blue"
              value={values.size}
              onChange={(event) => set("size", event.target.value)}
              maxLength={LIMITS.size}
              autoComplete="off"
              className={fieldClass}
            />
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
