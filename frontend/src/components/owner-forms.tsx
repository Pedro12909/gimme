import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormSheet } from "@/components/form-sheet";
import { Input } from "@/components/ui/input";
import { ItemThumbnail } from "@/components/item-thumbnail";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { previewLink, type ItemInput, type ListInput } from "@/lib/owner-api";
import { safeHref, siteName } from "@/lib/links";
import { useDebouncedValue } from "@/lib/use-debounced-value";

// Limits match the owner Lambda's validation
const LIMITS = {
  listTitle: 100,
  description: 500,
  itemTitle: 200,
  note: 500,
  url: 2048,
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

const emptyItem: ItemInput = {
  url: "",
  title: "",
  note: "",
  imageUrl: "",
  price: "",
};

export function ItemFormSheet({
  open,
  onOpenChange,
  heading,
  submitLabel,
  initial = emptyItem,
  submitting,
  onSave,
  secondaryAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heading: string;
  submitLabel: string;
  initial?: ItemInput;
  submitting: boolean;
  onSave: (input: ItemInput) => void;
  secondaryAction?: React.ReactNode;
}) {
  const [values, set] = useFormState(open, initial);
  const url = values.url.trim();
  const urlValid = safeHref(url) !== undefined;
  // Only complain once something has been typed, never on an empty field
  const showUrlError = url !== "" && !urlValid;

  // Live preview: once a valid link has stopped changing, fetch its name, image and price
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

  // Editing without changing the link keeps the details saved with the item
  const imageUrl = urlUnchanged ? initial.imageUrl : (fetched?.imageUrl ?? "");
  const price = urlUnchanged ? initial.price : (fetched?.price ?? "");

  // Fill in the name from the page, but never overwrite one the owner typed
  const [autoTitle, setAutoTitle] = useState<string>();
  useEffect(() => {
    if (open) setAutoTitle(undefined);
  }, [open]);
  useEffect(() => {
    const title = fetched?.title;
    if (!title) return;
    if (values.title.trim() === "" || values.title === autoTitle) {
      set("title", title);
      setAutoTitle(title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to new preview results only
  }, [fetched]);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={heading}
      submitLabel={submitLabel}
      submitting={submitting}
      canSubmit={urlValid}
      onSubmit={() =>
        onSave({
          url,
          title: values.title.trim(),
          note: values.note.trim(),
          imageUrl,
          price,
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
        ) : imageUrl || price ? (
          <div className="flex items-center gap-3">
            <ItemThumbnail src={imageUrl || undefined} />
            <div className="min-w-0 text-sm">
              <p className="truncate text-muted-foreground">{siteName(url)}</p>
              {price && <p className="font-medium">{price}</p>}
            </div>
          </div>
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
        <Label htmlFor="item-note">Note (optional)</Label>
        <Textarea
          id="item-note"
          placeholder="Size, colour, anything that helps"
          value={values.note}
          onChange={(event) => set("note", event.target.value)}
          maxLength={LIMITS.note}
          className={textareaClass}
        />
      </div>
    </FormSheet>
  );
}
