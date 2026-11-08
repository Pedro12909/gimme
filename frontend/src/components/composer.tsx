import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon, IconButton } from "@/components/icon";
import { Menu, MenuItem } from "@/components/menu";
import { Modal } from "@/components/modal";
import { Sheet } from "@/components/sheet";
import { ApiError } from "@/lib/http";
import { newItemInput, slugName } from "@/lib/item-input";
import { safeHref, siteName } from "@/lib/links";
import { FULL_NOTICE, MAX_ITEMS_PER_LIST } from "@/lib/limits";
import {
  addItem,
  deleteItem,
  type Item,
  type ListSummary,
} from "@/lib/owner-api";
import {
  addItemToCache,
  refreshCounts,
  removeItemFromCache,
} from "@/lib/owner-data";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

// The composer (design/add-item.md): a one-line window for adding items. Type a name, maybe
// paste a link, press Enter. Nothing is read from the shop; photo, price and the rest are
// added later in the item panel. It stays open to add several in a row; ⌘Enter adds one and
// opens it.

const LINK = /https?:\/\/\S+/;

// "Kindle Paperwhite https://amzn.eu/d/abc" → the link, and the words around it
export function splitLink(text: string): { name: string; link?: string } {
  const match = LINK.exec(text);
  const link = match && safeHref(match[0]) ? match[0] : undefined;
  if (!match || !link) return { name: text };
  const rest =
    text.slice(0, match.index) +
    " " +
    text.slice(match.index + match[0].length);
  return { name: rest.replace(/\s+/g, " ").trim(), link };
}

// What gets saved as the name: what was typed, or else words from the link itself
const nameFromLink = (link: string) => slugName(link) || siteName(link);

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-hairline-strong px-1 font-sans text-[11px] font-medium text-muted">
      {children}
    </kbd>
  );
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? "⌘" : "Ctrl";

// A new item's empty photo slot
function PhotoSlot({ size }: { size: 56 | 36 }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex flex-none items-center justify-center rounded-sm border border-dashed border-hairline-strong bg-photo text-meta"
    >
      <Icon name="image" size={size === 56 ? 20 : 16} />
    </span>
  );
}

type Added = { key: string; title: string; site: string; item?: Item };

export type ComposerPrefill = { text: string };

function ComposerBody({
  lists,
  defaultListId,
  initialListId,
  prefill,
  input,
  phone,
  headingId,
  onOpenItem,
}: {
  lists: ListSummary[];
  defaultListId: string | undefined;
  initialListId: string | undefined;
  prefill?: ComposerPrefill;
  input: React.RefObject<HTMLInputElement | null>;
  phone: boolean;
  headingId: string;
  onOpenItem: (item: Item) => void;
}) {
  const queryClient = useQueryClient();
  const touch = useMediaQuery("(pointer: coarse)");
  const [initial] = useState(() => splitLink(prefill?.text ?? ""));
  const [name, setName] = useState(initial.name);
  const [link, setLink] = useState(initial.link);
  const [starred, setStarred] = useState(false);
  const [listId, setListId] = useState(initialListId ?? defaultListId);
  const [added, setAdded] = useState<Added[]>([]);
  const [error, setError] = useState<string>();
  const [opening, setOpening] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const listButton = useRef<HTMLButtonElement | null>(null);

  const list = lists.find((other) => other.listId === listId);
  const full = (list?.itemCount ?? 0) >= MAX_ITEMS_PER_LIST;
  const title = name.trim() || (link ? nameFromLink(link) : "");
  const namedFromLink = name.trim() === "" && link !== undefined;
  const canAdd = title !== "" && listId !== undefined && !full && !opening;

  // A link typed by hand becomes a chip once it's finished (a space after it)
  const changeName = (text: string) => {
    setError(undefined);
    if (/https?:\/\/\S+\s/.test(text)) {
      const split = splitLink(text);
      setLink(split.link);
      setName(split.name ? `${split.name} ` : "");
    } else {
      setName(text);
    }
  };

  const add = async (open: boolean) => {
    // A link still in the text is lifted out first
    const split = splitLink(name);
    const url = split.link ?? link;
    const typed = split.link ? split.name : name.trim();
    const itemTitle = typed || (url ? nameFromLink(url) : "");
    if (!itemTitle || !listId || full || opening) return;

    const body = newItemInput({ title: itemTitle, url, starred });
    setError(undefined);

    if (open) {
      setOpening(true);
      try {
        const item = await addItem(listId, body);
        addItemToCache(queryClient, item);
        refreshCounts(queryClient);
        onOpenItem(item);
      } catch (err) {
        setOpening(false);
        setError(addError(err));
      }
      return;
    }

    // Shown at once, in the list behind and in the Added list; replaced by the saved item
    const key = `adding-${crypto.randomUUID()}`;
    const draft: Item = {
      ...body,
      listId,
      itemId: key,
      createdAt: new Date().toISOString(),
    };
    addItemToCache(queryClient, draft);
    setAdded((current) => [
      { key, title: itemTitle, site: siteName(url) },
      ...current,
    ]);
    setName("");
    setLink(undefined);
    setStarred(false);
    input.current?.focus();

    try {
      const item = await addItem(listId, body);
      removeItemFromCache(queryClient, listId, key);
      addItemToCache(queryClient, item);
      refreshCounts(queryClient);
      setAdded((current) =>
        current.map((entry) =>
          entry.key === key ? { ...entry, item } : entry,
        ),
      );
    } catch (err) {
      removeItemFromCache(queryClient, listId, key);
      setAdded((current) => current.filter((entry) => entry.key !== key));
      // Back in the input, unless something new is being typed
      setName((current) => (current === "" ? typed : current));
      setLink((current) => current ?? url);
      setError(addError(err));
    }
  };

  const undo = async (entry: Added) => {
    if (!entry.item) return;
    setAdded((current) => current.filter((other) => other.key !== entry.key));
    removeItemFromCache(queryClient, entry.item.listId, entry.item.itemId);
    try {
      await deleteItem(entry.item.listId, entry.item.itemId);
    } catch {
      // Still there: put it back
      addItemToCache(queryClient, entry.item);
      setAdded((current) => [entry, ...current]);
      setError("Couldn't undo. Try again.");
    }
    refreshCounts(queryClient);
  };

  // ⌘L / Ctrl+L picks the list from anywhere in the composer
  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") {
      event.preventDefault();
      if (!menuOpen) listButton.current?.click();
    }
  };

  const placeholder = link
    ? "Name it"
    : added.length > 0
      ? "Add another…"
      : "Paste a link or type a name";

  const chip = link && (
    <span className="flex h-[26px] max-w-[45%] flex-none items-center gap-1 rounded-[6px] border border-hairline bg-surface pr-0.5 pl-2 text-[13px] text-ink-2">
      <span className="truncate">{siteName(link)}</span>
      <button
        type="button"
        aria-label="Remove the link"
        title="Remove the link"
        onClick={() => {
          setLink(undefined);
          input.current?.focus();
        }}
        className="flex size-5 flex-none items-center justify-center rounded-[4px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Icon name="close" size={12} strokeWidth={2.2} />
      </button>
    </span>
  );

  const textInput = (
    <input
      ref={input}
      type="text"
      aria-label="Name, or a link"
      placeholder={placeholder}
      value={name}
      maxLength={2048}
      autoComplete="off"
      autoCapitalize="sentences"
      enterKeyHint="done"
      onChange={(event) => changeName(event.target.value)}
      onPaste={(event) => {
        const text = event.clipboardData.getData("text/plain");
        const split = splitLink(text);
        if (!split.link) return;
        // The link becomes the chip (replacing any other); its words join the name
        event.preventDefault();
        setError(undefined);
        setLink(split.link);
        setName((current) =>
          [current.trim(), split.name].filter(Boolean).join(" "),
        );
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void add(event.metaKey || event.ctrlKey);
        } else if (event.key === "Backspace" && name === "" && link) {
          event.preventDefault();
          setLink(undefined);
        }
      }}
      className={cn(
        "h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-meta",
        phone ? "text-base" : "text-[19px]",
      )}
    />
  );

  const listChip = (
    <Menu
      label="Add to list"
      side={phone ? "top" : "bottom"}
      align="start"
      onOpenChange={setMenuOpen}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          ref={(element) => {
            listButton.current = element;
            (props.ref as React.RefObject<HTMLButtonElement | null>).current =
              element;
          }}
          aria-label={`List: ${list?.title ?? "none"}. Change list`}
          title="Change list"
          className={cn(
            "flex max-w-[220px] items-center gap-1.5 rounded-sm bg-surface px-2.5 text-[13px] font-medium transition-colors hover:bg-surface-2 aria-expanded:bg-surface-2",
            phone ? "h-10" : "h-7",
          )}
        >
          {list?.isDefault && (
            <Icon name="home" size={14} className="text-muted" />
          )}
          <span className="truncate">{list?.title ?? "Pick a list"}</span>
          <Icon name="chevron" size={12} className="text-muted" />
        </button>
      )}
    >
      {lists.map((other) => (
        <MenuItem
          key={other.listId}
          checked={other.listId === listId}
          onSelect={() => {
            setListId(other.listId);
            setError(undefined);
          }}
        >
          <span className="min-w-0 truncate">{other.title}</span>
          {other.isDefault && (
            <span role="img" aria-label="Default list" className="text-muted">
              <Icon name="home" size={14} />
            </span>
          )}
          {other.listId === listId && (
            <Icon name="check" size={15} className="ml-auto" />
          )}
        </MenuItem>
      ))}
    </Menu>
  );

  const wantSwitch = (
    <button
      type="button"
      role="switch"
      aria-checked={starred}
      aria-label="Want most"
      title="Want most"
      onClick={() => setStarred((on) => !on)}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-sm text-[13px] transition-colors",
        phone ? "size-10" : "h-7 px-2",
        starred
          ? "bg-accent font-medium text-accent-on hover:bg-accent-hover"
          : "text-ink-2 hover:bg-surface",
      )}
    >
      <Icon name={starred ? "star" : "star-outline"} size={14} />
      {!phone && "Want most"}
    </button>
  );

  const resultRow = title !== "" && !full && (
    <div role="listbox" aria-label="To add">
      <div
        role="option"
        aria-selected="true"
        className="flex items-center gap-3.5 rounded-md bg-surface px-3 py-2.5"
      >
        <PhotoSlot size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">Add “{title}”</p>
          <p className="truncate text-[13px] text-muted">
            {link
              ? namedFromLink
                ? `${siteName(link)} · named from the link`
                : siteName(link)
              : "No link yet. Add a shop, photo and price later."}
          </p>
        </div>
        {!touch && <Kbd>↵</Kbd>}
      </div>
      {error && (
        <p role="alert" className="px-3 pt-2 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );

  const addedList = added.length > 0 && (
    <div className="pt-1">
      <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted">
        Added to {list?.title}
      </p>
      <ul>
        {added.map((entry, index) => (
          <li key={entry.key} className="flex h-12 items-center gap-3 px-3">
            <PhotoSlot size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{entry.title}</p>
              {entry.site && (
                <p className="truncate text-[13px] text-muted">{entry.site}</p>
              )}
            </div>
            {index === 0 && (
              <button
                type="button"
                disabled={!entry.item}
                onClick={() => void undo(entry)}
                className="flex h-8 items-center rounded-sm px-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface disabled:text-muted"
              >
                Undo
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  const body = (
    <div aria-live="polite" className={cn(!phone && "p-2")}>
      {full ? (
        <p className="px-3 pt-3.5 pb-4 text-[13px] text-muted">{FULL_NOTICE}</p>
      ) : title === "" && added.length === 0 ? (
        <>
          <p className="px-3 pt-3.5 pb-4 text-[13px] text-muted">
            A name is enough. Add the rest later.
          </p>
          {error && (
            <p role="alert" className="px-3 pb-3 text-[13px] text-danger">
              {error}
            </p>
          )}
        </>
      ) : (
        resultRow
      )}
      {addedList}
    </div>
  );

  const hints = !touch && (
    <div className="ml-auto flex items-center gap-2 text-[13px]">
      {menuOpen ? (
        <span className="flex items-center gap-1.5 text-muted">
          Change list <Kbd>{MOD}</Kbd>
          <Kbd>L</Kbd>
        </span>
      ) : added.length > 0 && title === "" ? (
        <span className="flex items-center gap-1.5 text-muted">
          Done <Kbd>esc</Kbd>
        </span>
      ) : (
        <>
          <span
            className={cn(
              "flex items-center gap-1.5 font-medium",
              canAdd ? "text-ink" : "text-meta",
            )}
          >
            Add <Kbd>↵</Kbd>
          </span>
          <span aria-hidden="true" className="h-4 w-px bg-hairline" />
          <span className="flex items-center gap-1.5 text-muted">
            Add and edit <Kbd>{MOD}</Kbd>
            <Kbd>↵</Kbd>
          </span>
        </>
      )}
    </div>
  );

  if (phone) {
    return (
      <div className="flex flex-col gap-3 pt-1" onKeyDown={onKeyDown}>
        <h2 id={headingId} className="sr-only">
          Add an item
        </h2>
        <div className="flex h-12 items-center gap-2 rounded-card bg-surface pr-1 pl-3">
          {chip}
          {textInput}
          {(name !== "" || link) && (
            <IconButton
              icon="close"
              label="Clear"
              small
              onClick={() => {
                setName("");
                setLink(undefined);
                input.current?.focus();
              }}
            />
          )}
        </div>
        {body}
        <div className="flex items-center gap-2">
          {listChip}
          {wantSwitch}
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => void add(false)}
            className="ml-auto flex h-11 items-center rounded-md bg-accent px-5 text-[15px] font-semibold text-accent-on transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    );
  }

  return (
    <div onKeyDown={onKeyDown}>
      <h2 id={headingId} className="sr-only">
        Add an item
      </h2>
      <div className="flex h-[60px] items-center gap-2.5 border-b border-hairline pr-4 pl-5">
        <Icon name="plus" size={20} className="text-muted" />
        {chip}
        {textInput}
        {!touch && <Kbd>esc</Kbd>}
      </div>
      {body}
      <div className="flex h-12 items-center gap-2 border-t border-hairline px-3">
        {listChip}
        {wantSwitch}
        {hints}
      </div>
    </div>
  );
}

const addError = (err: unknown) =>
  err instanceof ApiError && err.status === 409
    ? FULL_NOTICE
    : "Couldn't add it. Try again.";

export function Composer({
  open,
  onClose,
  wide,
  ...props
}: {
  open: boolean;
  onClose: () => void;
  // Desktop: a window over the list. Phones: a bottom sheet.
  wide: boolean;
  lists: ListSummary[];
  defaultListId: string | undefined;
  // The list on screen, or none on a view (then the default list)
  initialListId: string | undefined;
  prefill?: ComposerPrefill;
  onOpenItem: (item: Item) => void;
}) {
  const headingId = useId();
  const input = useRef<HTMLInputElement>(null);

  // The text field takes focus when it opens, caret at the end of anything prefilled
  useEffect(() => {
    if (!open) return;
    const field = input.current;
    field?.setSelectionRange(field.value.length, field.value.length);
  }, [open]);

  const body = (
    <ComposerBody
      {...props}
      input={input}
      phone={!wide}
      headingId={headingId}
    />
  );

  if (!wide) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        labelledBy={headingId}
        initialFocus={input}
      >
        {body}
      </Sheet>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={headingId}
      initialFocus={input}
      // Not clipped, so the list menu can hang below it
      className="animate-composer-in inset-x-0 top-[15vh] bottom-auto mx-auto h-auto w-[600px] max-w-[calc(100vw-32px)] overflow-visible rounded-lg border border-hairline bg-ground shadow-menu"
    >
      {body}
    </Modal>
  );
}
