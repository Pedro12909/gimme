import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ConfirmAction } from "@/components/confirm-action";
import { TileSquare } from "@/components/tile";
import {
  extractLink,
  httpsOnly,
  ITEM_LIMITS as LIMITS,
  newItemInput,
} from "@/lib/item-input";
import { withCurrency } from "@/lib/item-view";
import { safeHref, siteName } from "@/lib/links";
import {
  previewLink,
  uploadImage,
  type Item,
  type ItemInput,
} from "@/lib/owner-api";
import { ImageReadError, resizeImage } from "@/lib/resize-image";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const joinWords = (words: string[], last: string) =>
  words.length < 2
    ? words.join("")
    : `${words.slice(0, -1).join(", ")} ${last} ${words.at(-1)}`;

// "Name and price filled in from zara.com. No photo found."
function filledInMessage(
  site: string,
  found: { name: boolean; photo: boolean; price: boolean },
) {
  const entries = Object.entries(found);
  const got = entries.filter(([, ok]) => ok).map(([word]) => word);
  const missing = entries.filter(([, ok]) => !ok).map(([word]) => word);
  if (got.length === 0) {
    return `Couldn't get details from ${site}. Fill them in below.`;
  }
  const filled = joinWords(got, "and");
  return `${filled[0].toUpperCase()}${filled.slice(1)} filled in from ${site}. ${
    missing.length > 0
      ? `No ${joinWords(missing, "or")} found.`
      : "Change anything that's off."
  }`;
}

const sameTag = (a: string, b: string) =>
  a.toLocaleLowerCase() === b.toLocaleLowerCase();

// "audio, For Ana" → ["audio", "for Ana"], reusing the list's spelling of a tag it already has
function parseTags(text: string, existing: string[]) {
  const tags: string[] = [];
  for (const raw of text.split(",")) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, LIMITS.tag);
    if (!tag || tags.some((t) => sameTag(t, tag))) continue;
    tags.push(existing.find((e) => sameTag(e, tag)) ?? tag);
  }
  return tags.slice(0, LIMITS.tags);
}

// A photo the owner picked from their device. The preview is a local copy shown meanwhile.
type Upload =
  | { kind: "none" }
  | { kind: "uploading"; preview: string }
  | { kind: "uploaded"; preview: string; key: string }
  | { kind: "failed"; message: string };

// Fields the preview can fill in; each only while it still holds what came from the link
type AutoField = "title" | "vendor" | "price";
const AUTO_FIELDS: AutoField[] = ["title", "vendor", "price"];

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} className="text-[13px] font-medium text-ink">
      {children}
    </span>
  );
}

export function ItemEditor({
  listId,
  item,
  headingId,
  existingTags,
  currency,
  justAdded,
  saving,
  saveFailed,
  onSave,
  removing,
  removeFailed,
  onRemove,
  onClose,
}: {
  // Uploaded photos belong to this list
  listId: string;
  item: Item;
  headingId: string;
  // Tags already used in this list, so the same tag keeps one spelling
  existingTags: string[];
  // What most of the list's prices are in, e.g. "€"
  currency: string;
  // Added a moment ago from a pasted link: say what the shop filled in
  justAdded: boolean;
  saving: boolean;
  saveFailed: boolean;
  onSave: (input: ItemInput) => void;
  removing: boolean;
  removeFailed: boolean;
  onRemove: () => void;
  onClose: () => void;
}) {
  // The parent gives each item its own editor (a `key`), so this starts fresh per item
  const [values, setValues] = useState({
    url: item.url,
    title: item.title ?? "",
    price: item.price ?? "",
    vendor: item.vendor ?? "",
    size: item.size ?? "",
    tags: (item.tags ?? []).join(", "),
    note: item.note ?? "",
    alternatives: item.alternatives ?? [],
    starred: item.starred ?? false,
    got: item.got ?? false,
    // A photo link the owner picked, which wins over the link's own
    photo: "",
  });
  type Values = typeof values;
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const [attempted, setAttempted] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const urlInput = useRef<HTMLInputElement>(null);

  const url = values.url.trim();
  const urlValid = safeHref(url) !== undefined;
  const urlChanged = url !== item.url;
  const showUrlError = !urlValid && (attempted || url !== "");

  // A changed link is previewed once it has stopped changing
  const debouncedUrl = useDebouncedValue(
    urlValid && urlChanged ? url : "",
    400,
  );
  const preview = useQuery({
    queryKey: ["preview", debouncedUrl],
    queryFn: () => previewLink(debouncedUrl),
    enabled: debouncedUrl !== "" && debouncedUrl === url,
    retry: false,
    staleTime: Infinity,
  });
  const fetched = urlChanged && debouncedUrl === url ? preview.data : undefined;
  const previewing =
    urlValid && urlChanged && (debouncedUrl !== url || preview.isFetching);
  const previewFailed =
    urlValid && urlChanged && debouncedUrl === url && preview.isError;

  // What the item was saved with came from its link, so a new link may replace it
  const autoFilled = useRef<Record<AutoField, string>>({
    title: item.title ?? "",
    vendor: item.vendor ?? "",
    price: item.price ?? "",
  });
  useEffect(() => {
    if (!fetched) return;
    const filled = newItemInput(url, fetched);
    for (const field of AUTO_FIELDS) {
      const next = filled[field];
      if (
        next &&
        (values[field].trim() === "" ||
          values[field] === autoFilled.current[field])
      ) {
        set(field, next);
        autoFilled.current[field] = next;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to new preview results only
  }, [fetched]);

  const [upload, setUpload] = useState<Upload>({ kind: "none" });
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const uploadPreview = "preview" in upload ? upload.preview : undefined;
  useEffect(() => {
    if (uploadPreview) return () => URL.revokeObjectURL(uploadPreview);
  }, [uploadPreview]);

  const choosePhoto = async (file: File) => {
    let image: Blob;
    try {
      image = await resizeImage(file);
    } catch (err) {
      setUpload({
        kind: "failed",
        message:
          err instanceof ImageReadError
            ? err.message
            : "Couldn't read that image.",
      });
      return;
    }

    const preview = URL.createObjectURL(image);
    setUpload({ kind: "uploading", preview });
    // The new photo replaces any photo link or removal
    set("photo", "");
    setPhotoOpen(false);
    setPhotoRemoved(false);

    // Ignored if another photo was picked meanwhile
    const settle = (next: Upload) =>
      setUpload((current) =>
        current.kind === "uploading" && current.preview === preview
          ? next
          : current,
      );
    try {
      settle({
        kind: "uploaded",
        preview,
        key: await uploadImage(listId, image),
      });
    } catch {
      settle({
        kind: "failed",
        message: "Couldn't upload the photo. Try again.",
      });
    }
  };

  // A photo the owner uploaded before stays even if the link changes
  const keepsUpload = Boolean(item.imageKey) && !photoRemoved;
  const linkImage = photoRemoved
    ? ""
    : urlChanged && !keepsUpload
      ? httpsOnly(fetched?.imageUrl)
      : (item.imageUrl ?? "");
  const ownPhoto = values.photo.trim();
  const photoError = ownPhoto !== "" && !httpsOnly(ownPhoto);
  const imageUrl = uploadPreview || (!photoError && ownPhoto) || linkImage;
  const uploading = upload.kind === "uploading";

  const message =
    upload.kind === "uploading"
      ? "Uploading your photo…"
      : upload.kind === "failed"
        ? upload.message
        : previewing
          ? `Getting details from ${siteName(url)}…`
          : previewFailed
            ? `Couldn't get details from ${siteName(url)}.`
            : fetched
              ? filledInMessage(siteName(url), {
                  name: Boolean(fetched.title),
                  photo: Boolean(httpsOnly(fetched.imageUrl)),
                  price: Boolean(fetched.price),
                })
              : justAdded && !urlChanged
                ? filledInMessage(siteName(item.url), {
                    name: Boolean(item.title),
                    photo: Boolean(item.imageUrl),
                    price: Boolean(item.price),
                  })
                : undefined;

  // A price typed as a bare number ("89,95") gets the currency the rest of the list uses.
  // Only once per number: taking the currency off again is the owner's call. A price the
  // item was saved with is left alone too.
  const currencyAddedTo = useRef("");
  const completePrice = (typed: string) => {
    const price = typed.trim();
    if (price === (item.price ?? "") || price === currencyAddedTo.current)
      return price;
    const completed = withCurrency(price, currency);
    if (completed !== price) currencyAddedTo.current = price;
    return completed;
  };

  // One field per other shop, plus an empty one to add the next
  const alternatives =
    values.alternatives.length >= LIMITS.alternatives ||
    values.alternatives.some((link) => link.trim() === "")
      ? values.alternatives
      : [...values.alternatives, ""];
  const alternativeErrors = alternatives.map(
    (link) => link.trim() !== "" && safeHref(link.trim()) === undefined,
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!urlValid) {
      urlInput.current?.focus();
      return;
    }
    // These fields already say what's wrong, next to themselves
    if (photoError || alternativeErrors.some(Boolean)) return;
    if (uploading) return;

    onSave({
      url,
      title: values.title.trim(),
      note: values.note.trim(),
      // The server sets the image link for an uploaded photo
      imageUrl: upload.kind === "uploaded" ? "" : imageUrl,
      imageUpload: upload.kind === "uploaded" ? upload.key : undefined,
      // Enter in the price field saves without leaving it
      price: completePrice(values.price),
      vendor: values.vendor.trim(),
      size: values.size.trim(),
      alternatives: values.alternatives
        .map((link) => link.trim())
        .filter(Boolean),
      tags: parseTags(values.tags, existingTags),
      starred: values.starred,
      got: values.got,
    });
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={headingId} className="section-title">
          Edit
        </h2>
        <button type="button" className="action" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="flex items-center gap-3.5">
        {/* A hairline, or a white photo would vanish into the white panel */}
        <TileSquare
          imageUrl={imageUrl}
          className="w-18 shrink-0 border border-hairline"
        />
        <div className="min-w-0 text-[13px] leading-[1.45] text-muted">
          {message && (
            <p aria-live="polite" className="text-pretty">
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4">
            <button
              type="button"
              className="action min-h-8 text-ink"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              Upload a photo
            </button>
            {!photoOpen && (
              <button
                type="button"
                className="action min-h-8 text-ink"
                onClick={() => setPhotoOpen(true)}
              >
                Use a link
              </button>
            )}
            {imageUrl && !uploading && (
              <button
                type="button"
                className="action min-h-8 text-ink"
                onClick={() => {
                  setUpload({ kind: "none" });
                  set("photo", "");
                  setPhotoOpen(false);
                  setPhotoRemoved(true);
                }}
              >
                Remove photo
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared so picking the same file again still counts as a change
              event.target.value = "";
              if (file) void choosePhoto(file);
            }}
          />
        </div>
      </div>

      <form noValidate onSubmit={submit} className="flex flex-col gap-[18px]">
        {photoOpen && (
          <label className="label">
            Photo link
            <input
              type="url"
              inputMode="url"
              autoFocus
              placeholder="https://… (an image from any site)"
              value={values.photo}
              onChange={(event) => {
                // A typed photo link replaces an uploaded one
                setUpload({ kind: "none" });
                set("photo", extractLink(event.target.value));
              }}
              maxLength={LIMITS.url}
              autoComplete="off"
              aria-invalid={photoError}
              aria-describedby={photoError ? "photo-error" : undefined}
              className="field"
            />
            {photoError && (
              <FieldError id="photo-error">
                Paste a full image link, starting with https://
              </FieldError>
            )}
          </label>
        )}

        <label className="label">
          Link
          <input
            ref={urlInput}
            type="url"
            inputMode="url"
            value={values.url}
            onChange={(event) => set("url", extractLink(event.target.value))}
            maxLength={LIMITS.url}
            autoComplete="off"
            aria-invalid={showUrlError}
            aria-describedby={showUrlError ? "url-error" : undefined}
            className="field"
          />
          {showUrlError && (
            <FieldError id="url-error">
              {url === ""
                ? "An item needs a link. Paste one from any shop."
                : "Paste a full link, starting with https://"}
            </FieldError>
          )}
        </label>

        <label className="label">
          Name
          <input
            type="text"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            maxLength={LIMITS.title}
            autoComplete="off"
            className="field"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            Price
            <input
              type="text"
              placeholder={currency ? `e.g. ${currency}19,99` : "e.g. €19,99"}
              value={values.price}
              onChange={(event) => set("price", event.target.value)}
              onBlur={() => set("price", completePrice(values.price))}
              maxLength={LIMITS.price}
              autoComplete="off"
              className="field"
            />
          </label>
          <label className="label">
            Shop
            <input
              type="text"
              placeholder={urlValid ? siteName(url) : "e.g. Amazon"}
              value={values.vendor}
              onChange={(event) => set("vendor", event.target.value)}
              maxLength={LIMITS.vendor}
              autoComplete="off"
              className="field"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            Size or colour
            <input
              type="text"
              placeholder="Optional"
              value={values.size}
              onChange={(event) => set("size", event.target.value)}
              maxLength={LIMITS.size}
              autoComplete="off"
              className="field"
            />
          </label>
          <label className="label">
            Tags
            <input
              type="text"
              // A thing or a person: tags also say who a gift is for
              placeholder="Separate with commas"
              value={values.tags}
              onChange={(event) => set("tags", event.target.value)}
              autoComplete="off"
              className="field"
            />
          </label>
        </div>

        <label className="label">
          Note for guests
          <textarea
            rows={2}
            placeholder="e.g. any colour but white"
            value={values.note}
            onChange={(event) => set("note", event.target.value)}
            maxLength={LIMITS.note}
            className="field"
          />
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13px] text-muted">
            Other places to buy it
          </legend>
          {alternatives.map((link, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <input
                type="url"
                inputMode="url"
                aria-label={`Other shop link ${index + 1}`}
                placeholder="Paste another link (optional)"
                value={link}
                onChange={(event) => {
                  const next = [...alternatives];
                  next[index] = extractLink(event.target.value);
                  set("alternatives", next);
                }}
                maxLength={LIMITS.url}
                autoComplete="off"
                aria-invalid={alternativeErrors[index]}
                className="field"
              />
              {alternativeErrors[index] && (
                <FieldError id={`alternative-error-${index}`}>
                  Paste a full link, starting with https://
                </FieldError>
              )}
            </div>
          ))}
        </fieldset>

        <div className="flex flex-col gap-3 pt-1 text-[15px]">
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={values.starred}
              onChange={(event) => set("starred", event.target.checked)}
            />
            Want this most
          </label>
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={values.got}
              onChange={(event) => set("got", event.target.checked)}
            />
            <span>
              Got it already{" "}
              <span className="text-[13px] text-muted">
                — guests can't claim it
              </span>
            </span>
          </label>
        </div>

        {(saveFailed || removeFailed) && (
          <p role="alert" className="text-[13px] font-medium">
            {saveFailed
              ? "Couldn't save. Try again."
              : "Couldn't remove it. Try again."}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-5 pt-3">
          <button
            type="submit"
            className="submit"
            disabled={saving || uploading}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="action" onClick={onClose}>
            Cancel
          </button>
          <span className="ml-auto">
            <ConfirmAction
              label="Remove"
              question="Remove it?"
              confirmLabel="Remove"
              onConfirm={onRemove}
              busy={removing}
            />
          </span>
        </div>
      </form>
    </div>
  );
}
