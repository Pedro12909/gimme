import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon, IconButton } from "@/components/icon";
import { Menu, MenuItem, MenuNote } from "@/components/menu";
import { useTwoStep } from "@/components/two-step";
import { ApiError } from "@/lib/http";
import { extractLink, ITEM_LIMITS as LIMITS } from "@/lib/item-input";
import { withCurrency } from "@/lib/item-view";
import { safeHref, siteName } from "@/lib/links";
import { MAX_ITEMS_PER_LIST } from "@/lib/limits";
import {
  deleteItem,
  copyItemToList,
  updateItem,
  uploadImage,
  type Item,
  type ItemInput,
  type ListSummary,
} from "@/lib/owner-api";
import {
  listKey,
  patchItemInCache,
  refreshCounts,
  removeItemFromCache,
} from "@/lib/owner-data";
import { ImageReadError, resizeImage } from "@/lib/resize-image";
import { cn } from "@/lib/utils";

// The selected item, edited in place: every change saves itself (design/home-redesign.md, 7).
// The parent gives each item its own panel (a `key`), so this starts fresh per item.

const SAVE_DELAY = 600;

const sameTag = (a: string, b: string) =>
  a.toLocaleLowerCase() === b.toLocaleLowerCase();

// "audio, For Ana" → ["audio", "For Ana"], reusing the spelling of a tag already in use
function addTags(current: string[], text: string, existing: string[]) {
  const tags = [...current];
  for (const raw of text.split(",")) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, LIMITS.tag);
    if (!tag || tags.some((t) => sameTag(t, tag))) continue;
    tags.push(existing.find((e) => sameTag(e, tag)) ?? tag);
  }
  return tags.slice(0, LIMITS.tags);
}

// The first image among dropped or pasted files
const imageFile = (files: FileList | null | undefined) =>
  Array.from(files ?? []).find((file) => file.type.startsWith("image/"));

// Drags of text or links aren't photos and keep their usual behaviour
const draggingFiles = (event: { dataTransfer: DataTransfer | null }) =>
  event.dataTransfer?.types.includes("Files") ?? false;

const rowInput =
  "h-9 w-full min-w-0 rounded-sm bg-transparent px-2 text-sm placeholder:text-meta hover:bg-surface focus:bg-surface";

function Row({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-hairline-subtle">
      <div className="flex min-h-10 items-center gap-1">
        <label
          htmlFor={htmlFor}
          className="w-14 flex-none text-[13px] text-muted"
        >
          {label}
        </label>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-0.5">
          {children}
        </div>
      </div>
      {error && (
        <p role="alert" className="pb-2 pl-15 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Toggle({
  on,
  icon,
  label,
  onChange,
}: {
  on: boolean;
  icon: "star" | "check";
  label: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "flex h-11 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold",
        on
          ? "bg-accent text-accent-on hover:bg-accent-hover"
          : "border border-hairline-strong bg-ground text-ink hover:bg-surface",
      )}
    >
      <Icon name={icon} size={16} />
      {label}
    </button>
  );
}

export function ItemPanel({
  item,
  lists,
  existingTags,
  currency,
  headingId,
  onClose,
}: {
  item: Item;
  // For Copy: every list, this item's own included
  lists: ListSummary[];
  // Tags already in use, so the same tag keeps one spelling
  existingTags: string[];
  // What most prices are in, e.g. "€", for a price typed as a bare number
  currency: string;
  headingId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { listId, itemId } = item;
  const ids = useId();

  // What the fields show. Valid values also go straight into the cache, so the tile
  // changes as the owner types; the server gets them a moment later.
  const [values, setValues] = useState({
    title: item.title ?? "",
    price: item.price ?? "",
    vendor: item.vendor ?? "",
    url: item.url,
    note: item.note ?? "",
    size: item.size ?? "",
    tags: item.tags ?? [],
    alternatives: item.alternatives ?? [],
    starred: item.starred ?? false,
    got: item.got ?? false,
  });
  type Values = typeof values;
  const [tagDraft, setTagDraft] = useState("");

  // --- Saving -----------------------------------------------------------------------
  const pending = useRef<Partial<ItemInput>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // One save at a time, in order, so an older save can't land after a newer one
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">(
    "idle",
  );

  const flush = () => {
    clearTimeout(timer.current);
    const input = pending.current;
    if (Object.keys(input).length === 0) return chain.current;
    pending.current = {};
    setStatus("saving");
    chain.current = chain.current.then(async () => {
      try {
        const saved = await updateItem(listId, itemId, input);
        // Fields typed since this save went out keep what the owner typed
        const newer = new Set(Object.keys(pending.current));
        patchItemInCache(
          queryClient,
          listId,
          itemId,
          Object.fromEntries(
            Object.entries(saved).filter(([field]) => !newer.has(field)),
          ),
        );
        if ("starred" in input || "got" in input || "imageUpload" in input) {
          refreshCounts(queryClient);
        }
        setStatus((current) => (current === "saving" ? "saved" : current));
      } catch (err) {
        // Kept for the next save, unless the item is gone
        if (err instanceof ApiError && err.status === 404) {
          removeItemFromCache(queryClient, listId, itemId);
          return;
        }
        pending.current = { ...input, ...pending.current };
        setStatus("failed");
      }
    });
    return chain.current;
  };

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  // Closing the panel or picking another item saves what's left
  useEffect(() => () => void flushRef.current(), []);

  // "Saved" shows for 2 seconds after each save
  useEffect(() => {
    if (status !== "saved") return;
    const fade = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(fade);
  }, [status]);

  const queue = (input: Partial<ItemInput>, now = false) => {
    Object.assign(pending.current, input);
    clearTimeout(timer.current);
    if (now) void flush();
    else timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  };

  // A field changes: shown at once, cached if valid, saved after a pause
  const change = <K extends keyof Values>(
    field: K,
    value: Values[K],
    { valid = true, now = false } = {},
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (!valid) return;
    const sent =
      typeof value === "string" && field !== "url" ? value.trim() : value;
    patchItemInCache(queryClient, listId, itemId, {
      [field]: sent === "" ? undefined : sent,
    });
    queue({ [field]: sent } as Partial<ItemInput>, now);
  };

  // --- Validation ---------------------------------------------------------------------
  const url = values.url.trim();
  const urlError =
    url === ""
      ? "An item needs a link. Paste one from any shop."
      : safeHref(url) === undefined
        ? "Paste a full link, starting with https://"
        : undefined;
  const alternativeErrors = values.alternatives.map((link) =>
    link.trim() !== "" && safeHref(link.trim()) === undefined
      ? "Paste a full link, starting with https://"
      : undefined,
  );
  const saveAlternatives = (alternatives: string[]) => {
    const valid = alternatives.every(
      (link) => link.trim() === "" || safeHref(link.trim()) !== undefined,
    );
    setValues((current) => ({ ...current, alternatives }));
    if (!valid) return;
    const links = alternatives.map((link) => link.trim()).filter(Boolean);
    patchItemInCache(queryClient, listId, itemId, { alternatives: links });
    queue({ alternatives: links });
  };

  // A price typed as a bare number ("89,95") gets the currency the rest uses, once
  const completePrice = () => {
    const price = values.price.trim();
    const completed = withCurrency(price, currency);
    if (completed !== price) change("price", completed);
  };

  const setTags = (tags: string[]) => change("tags", tags);

  // --- Photo: picked, dropped or pasted -------------------------------------------------
  const [photo, setPhoto] = useState<
    | { kind: "none" }
    | { kind: "uploading"; preview: string }
    | { kind: "failed"; message: string }
  >({ kind: "none" });
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadPreview = photo.kind === "uploading" ? photo.preview : undefined;
  useEffect(() => {
    if (uploadPreview) return () => URL.revokeObjectURL(uploadPreview);
  }, [uploadPreview]);

  const choosePhoto = async (file: File) => {
    let image: Blob;
    try {
      image = await resizeImage(file);
    } catch (err) {
      setPhoto({
        kind: "failed",
        message:
          err instanceof ImageReadError
            ? err.message
            : "Couldn't read that image.",
      });
      return;
    }
    const preview = URL.createObjectURL(image);
    setPhoto({ kind: "uploading", preview });
    try {
      const key = await uploadImage(listId, image);
      // The server sets the image link for an uploaded photo
      queue({ imageUpload: key, imageUrl: "" }, true);
      await chain.current;
      setPhoto({ kind: "none" });
    } catch {
      setPhoto({
        kind: "failed",
        message: "Couldn't upload the photo. Try again.",
      });
    }
  };

  const takePhoto = (file: File | undefined) => {
    if (photo.kind === "uploading") return;
    if (file) void choosePhoto(file);
    else setPhoto({ kind: "failed", message: "That isn't an image." });
  };

  // Drag events fire again for every child entered and left, so count to know when the
  // file has really left the panel
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const dropHandlers = {
    onDragEnter: (event: React.DragEvent) => {
      if (!draggingFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (event: React.DragEvent) => {
      if (!draggingFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!draggingFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (event: React.DragEvent) => {
      if (!draggingFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      takePhoto(imageFile(event.dataTransfer.files));
    },
  };

  const takePhotoRef = useRef(takePhoto);
  useEffect(() => {
    takePhotoRef.current = takePhoto;
  });
  useEffect(() => {
    // A file dropped just outside the panel would otherwise open in the tab
    const keepPage = (event: DragEvent) => {
      if (draggingFiles(event)) event.preventDefault();
    };
    // An image pasted anywhere while the panel is open becomes the photo. Text pasted into
    // a field still pastes as text.
    const onPaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      const file = imageFile(data?.files);
      if (!data || !file) return;
      const inField = (event.target as Element | null)?.closest?.(
        "input, textarea, [contenteditable]",
      );
      if (inField && data.types.includes("text/plain")) return;
      event.preventDefault();
      takePhotoRef.current(file);
    };
    window.addEventListener("dragover", keepPage);
    window.addEventListener("drop", keepPage);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", keepPage);
      window.removeEventListener("drop", keepPage);
      document.removeEventListener("paste", onPaste);
    };
  }, []);

  // --- Copy and remove ----------------------------------------------------------------
  // Quiet feedback under the top bar: a copy made, or something that failed
  const [problem, setProblem] = useState<string>();
  const [copied, setCopied] = useState<string>();
  const others = lists.filter((list) => list.listId !== listId);

  const copy = async (to: ListSummary) => {
    setProblem(undefined);
    setCopied(undefined);
    // The copy gets the latest edits
    await flush();
    try {
      await copyItemToList(listId, itemId, to.listId);
      queryClient.invalidateQueries({ queryKey: listKey(to.listId) });
      refreshCounts(queryClient);
      setCopied(`Copied to ${to.title}.`);
    } catch (err) {
      setProblem(
        err instanceof ApiError && err.status === 409
          ? `${to.title} is full.`
          : "Couldn't copy it. Try again.",
      );
    }
  };

  const [removing, setRemoving] = useState(false);
  const remove = useTwoStep(async () => {
    clearTimeout(timer.current);
    pending.current = {};
    setRemoving(true);
    setProblem(undefined);
    try {
      await deleteItem(listId, itemId);
      removeItemFromCache(queryClient, listId, itemId);
      refreshCounts(queryClient);
      onClose();
    } catch {
      setRemoving(false);
      setProblem("Couldn't remove it. Try again.");
    }
  });

  const href = safeHref(item.url);
  const imageUrl = uploadPreview ?? item.imageUrl;
  const statusText =
    status === "saved"
      ? "Saved"
      : status === "failed"
        ? "Couldn't save. Keep editing to try again."
        : "";

  return (
    <div className="flex flex-col gap-4" {...dropHandlers}>
      <h2 id={headingId} className="sr-only">
        {values.title.trim() || siteName(item.url)}
      </h2>

      <div className="flex items-center gap-0.5">
        <p
          aria-live="polite"
          className={cn(
            "mr-auto min-w-0 truncate text-[13px] transition-opacity duration-500",
            status === "failed" ? "text-danger" : "text-muted",
            statusText ? "opacity-100" : "opacity-0",
          )}
        >
          {statusText}
        </p>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open in the shop"
            title="Open in the shop"
            className="icon-button"
          >
            <Icon name="open" />
          </a>
        )}
        <Menu
          label="Copy to"
          trigger={(props) => (
            <IconButton icon="copy" label="Copy to another list" {...props} />
          )}
        >
          {others.length === 0 ? (
            <MenuNote>Make another list to copy things there.</MenuNote>
          ) : (
            others.map((list) => (
              <MenuItem
                key={list.listId}
                disabled={list.itemCount >= MAX_ITEMS_PER_LIST}
                onSelect={() => void copy(list)}
              >
                <span className="min-w-0 truncate">{list.title}</span>
              </MenuItem>
            ))
          )}
        </Menu>
        {remove.armed ? (
          <button
            type="button"
            autoFocus
            onBlur={remove.cancel}
            onClick={remove.press}
            disabled={removing}
            className="flex h-10 items-center rounded-md px-2.5 text-sm font-semibold text-danger hover:bg-surface"
          >
            {removing ? "Removing…" : "Remove?"}
          </button>
        ) : (
          <IconButton icon="trash" label="Remove" onClick={remove.press} />
        )}
        <IconButton icon="close" label="Close" onClick={onClose} />
      </div>

      {problem && (
        <p role="alert" className="-mt-2 text-[13px] text-danger">
          {problem}
        </p>
      )}
      {copied && !problem && (
        <p role="status" className="-mt-2 text-[13px] text-muted">
          {copied}
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={photo.kind === "uploading"}
          aria-label="Change photo: pick one, or drop or paste it here"
          title="Change photo"
          className={cn(
            "relative block aspect-[4/3] w-full overflow-hidden rounded-card border border-hairline bg-photo",
            dragging &&
              "outline-2 outline-offset-3 outline-accent outline-dashed",
          )}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              referrerPolicy="no-referrer"
              className={cn(
                "size-full object-contain p-[8%]",
                photo.kind === "uploading" && "opacity-60",
              )}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center bg-surface text-[13px] text-muted">
              {dragging ? "Drop the photo" : "Add a photo"}
            </span>
          )}
        </button>
        {(photo.kind !== "none" || dragging) && (
          <p aria-live="polite" className="mt-1.5 text-[13px] text-muted">
            {dragging
              ? "Drop to use this photo"
              : photo.kind === "failed"
                ? photo.message
                : "Uploading the photo…"}
          </p>
        )}
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

      <textarea
        aria-label="Name"
        rows={2}
        value={values.title}
        placeholder={siteName(item.url)}
        maxLength={LIMITS.title}
        onChange={(event) => change("title", event.target.value)}
        onBlur={() => void flush()}
        onKeyDown={(event) => {
          // Enter finishes the name rather than starting a new line
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className="-mx-2 resize-none rounded-sm bg-transparent px-2 py-1 text-[19px] leading-[1.3] font-semibold placeholder:text-muted hover:bg-surface focus:bg-surface"
      />

      <div onBlur={() => void flush()}>
        <Row label="Price" htmlFor={`${ids}-price`}>
          <input
            id={`${ids}-price`}
            type="text"
            className={cn(rowInput, "tabular-nums")}
            placeholder={currency ? `${currency}19,99` : "€19,99"}
            value={values.price}
            maxLength={LIMITS.price}
            autoComplete="off"
            onChange={(event) => change("price", event.target.value)}
            onBlur={completePrice}
          />
        </Row>
        <Row label="Shop" htmlFor={`${ids}-shop`}>
          <input
            id={`${ids}-shop`}
            type="text"
            className={rowInput}
            placeholder={siteName(url || item.url)}
            value={values.vendor}
            maxLength={LIMITS.vendor}
            autoComplete="off"
            onChange={(event) => change("vendor", event.target.value)}
          />
        </Row>
        <Row label="Link" htmlFor={`${ids}-link`} error={urlError}>
          <input
            id={`${ids}-link`}
            type="url"
            inputMode="url"
            className={rowInput}
            value={values.url}
            maxLength={LIMITS.url}
            autoComplete="off"
            aria-invalid={urlError !== undefined}
            onChange={(event) => {
              const next = extractLink(event.target.value);
              change("url", next, {
                valid: safeHref(next.trim()) !== undefined,
              });
            }}
          />
        </Row>
        <Row label="Note" htmlFor={`${ids}-note`}>
          <input
            id={`${ids}-note`}
            type="text"
            className={rowInput}
            placeholder="Size, colour…"
            value={values.note}
            maxLength={LIMITS.note}
            autoComplete="off"
            onChange={(event) => change("note", event.target.value)}
          />
        </Row>
        <Row label="Size" htmlFor={`${ids}-size`}>
          <input
            id={`${ids}-size`}
            type="text"
            className={rowInput}
            placeholder="Optional"
            value={values.size}
            maxLength={LIMITS.size}
            autoComplete="off"
            onChange={(event) => change("size", event.target.value)}
          />
        </Row>
        <Row label="Tags" htmlFor={`${ids}-tags`}>
          {values.tags.map((tag) => (
            <span
              key={tag}
              className="flex h-7 max-w-full items-center gap-0.5 rounded-full bg-surface pr-0.5 pl-2.5 text-[13px]"
            >
              <span className="truncate">{tag}</span>
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                title={`Remove ${tag}`}
                onClick={() =>
                  setTags(values.tags.filter((other) => other !== tag))
                }
                className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
              >
                <Icon name="close" size={12} strokeWidth={2.2} />
              </button>
            </span>
          ))}
          {values.tags.length < LIMITS.tags && (
            <input
              id={`${ids}-tags`}
              type="text"
              className={cn(rowInput, "w-auto flex-1 basis-24")}
              placeholder={values.tags.length === 0 ? "Add a tag" : ""}
              value={tagDraft}
              autoComplete="off"
              onChange={(event) => {
                const text = event.target.value;
                if (text.includes(",")) {
                  setTags(addTags(values.tags, text, existingTags));
                  setTagDraft("");
                } else {
                  setTagDraft(text);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && tagDraft.trim()) {
                  event.preventDefault();
                  setTags(addTags(values.tags, tagDraft, existingTags));
                  setTagDraft("");
                } else if (
                  event.key === "Backspace" &&
                  tagDraft === "" &&
                  values.tags.length > 0
                ) {
                  setTags(values.tags.slice(0, -1));
                }
              }}
              onBlur={() => {
                if (!tagDraft.trim()) return;
                setTags(addTags(values.tags, tagDraft, existingTags));
                setTagDraft("");
              }}
            />
          )}
        </Row>
        {/* One row per other shop, plus an empty one to add the next */}
        {[
          ...values.alternatives,
          ...(values.alternatives.length < LIMITS.alternatives &&
          !values.alternatives.some((link) => link.trim() === "")
            ? [""]
            : []),
        ].map((link, index) => (
          <Row
            key={index}
            label={index === 0 ? "Also at" : ""}
            htmlFor={`${ids}-alt-${index}`}
            error={alternativeErrors[index]}
          >
            <input
              id={`${ids}-alt-${index}`}
              type="url"
              inputMode="url"
              aria-label={
                index === 0 ? undefined : `Also at, link ${index + 1}`
              }
              className={rowInput}
              placeholder="Another shop's link"
              value={link}
              maxLength={LIMITS.url}
              autoComplete="off"
              onChange={(event) => {
                const next = [...values.alternatives];
                next[index] = extractLink(event.target.value);
                saveAlternatives(next);
              }}
              onBlur={() =>
                // An emptied row goes away
                saveAlternatives(
                  values.alternatives.filter((other) => other.trim() !== ""),
                )
              }
            />
          </Row>
        ))}
      </div>

      <div className="flex gap-2">
        <Toggle
          on={values.starred}
          icon="star"
          label="Want most"
          onChange={(on) => change("starred", on, { now: true })}
        />
        <Toggle
          on={values.got}
          icon="check"
          label="Got it"
          onChange={(on) => change("got", on, { now: true })}
        />
      </div>
    </div>
  );
}
