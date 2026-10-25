import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GroupedItems } from "@/components/grouped-items";
import { ItemEditor } from "@/components/item-editor";
import { ListControls } from "@/components/list-controls";
import { Modal } from "@/components/modal";
import { OwnerTiles } from "@/components/owner-tiles";
import { BackLink, OwnerHeader, PageShell } from "@/components/page-shell";
import { TileGrid, TileSquare } from "@/components/tile";
import { formatEventDate } from "@/lib/event-date";
import { rememberOwnShareTokens } from "@/lib/guest-storage";
import { ApiError } from "@/lib/http";
import { extractLink, newItemInput } from "@/lib/item-input";
import { sortByPosition } from "@/lib/item-order";
import {
  applyView,
  budgetOptions,
  collectTags,
  countThings,
  groupItems,
  isFiltered,
  usualCurrency,
} from "@/lib/item-view";
import { safeHref, siteName } from "@/lib/links";
import {
  addItem,
  deleteItem,
  getList,
  moveItem,
  previewLink,
  shareUrl,
  updateItem,
  type Item,
  type ItemInput,
  type ListWithItems,
} from "@/lib/owner-api";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useListView } from "@/lib/use-list-view";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

// Phones get the system share sheet (WhatsApp, Messages…); elsewhere the link is copied
const sharesNatively = () =>
  typeof navigator.share === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

function ShareAction({ list }: { list: ListWithItems }) {
  const [native] = useState(sharesNatively);
  const [result, setResult] = useState<"copied" | "failed">();
  const url = shareUrl(list.shareToken);

  // "Copied" stands in for the label for a moment
  useEffect(() => {
    if (result !== "copied") return;
    const timer = setTimeout(() => setResult(undefined), 2000);
    return () => clearTimeout(timer);
  }, [result]);

  const share = async () => {
    if (native) {
      try {
        await navigator.share({ title: list.title, url });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setResult("copied");
    } catch {
      setResult("failed");
    }
  };

  return (
    <>
      <button type="button" className="action" onClick={share}>
        {result === "copied"
          ? "Copied"
          : native
            ? "Share link"
            : "Copy share link"}
      </button>
      {/* Without clipboard access the link is shown, ready to select */}
      {result === "failed" && (
        <span className="flex min-h-11 items-center break-all text-muted select-all">
          {url}
        </span>
      )}
    </>
  );
}

export default function ListDetail() {
  const { listId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [view, setView] = useListView(listId);
  const wide = useMediaQuery("(min-width: 1024px)");
  const editorHeadingId = useId();

  // The item being edited lives in the URL, so Back closes the editor (a full screen on phones)
  const editingId =
    new URLSearchParams(location.search).get("item") ?? undefined;
  // Added a moment ago: its editor says what the shop filled in
  const [justAdded, setJustAdded] = useState<string>();
  const [linkDraft, setLinkDraft] = useState("");
  // Quiet feedback under the link field: a bad link, or a save that failed
  const [notice, setNotice] = useState<string>();

  const queryKey = ["list", listId];
  const {
    data: list,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => getList(listId),
    retry: (count, err) =>
      !(err instanceof ApiError && err.status === 404) && count < 2,
  });
  useDocumentTitle(list?.title);

  // Covers links made since the lists screen was last opened
  useEffect(() => {
    if (list) rememberOwnShareTokens([list.shareToken]);
  }, [list]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["lists"] });
  };
  const setItems = (change: (items: Item[]) => Item[]) =>
    queryClient.setQueryData<ListWithItems>(
      queryKey,
      (current) => current && { ...current, items: change(current.items) },
    );

  const openEditor = (itemId: string) => {
    update.reset();
    removeItem.reset();
    // Opening is a step forward, so Back closes it; switching items replaces that step
    navigate(
      { search: `?item=${encodeURIComponent(itemId)}` },
      { replace: editingId !== undefined, state: { editorOpened: true } },
    );
  };
  const closeEditor = () => {
    setJustAdded(undefined);
    if ((location.state as { editorOpened?: boolean } | null)?.editorOpened) {
      navigate(-1);
    } else {
      navigate({ search: "" }, { replace: true });
    }
  };

  // Pasting a link adds the item straight away, with what the shop's page says about it.
  // The editor then opens on it, to fix anything the shop got wrong.
  const addByLink = useMutation({
    mutationFn: async ({ url, text }: { url: string; text?: string }) => {
      const preview = await previewLink(url, text).catch(() => undefined);
      return addItem(listId, newItemInput(url, preview));
    },
    onSuccess: (item) => {
      setItems((items) => [...items, item]);
      refresh();
      setLinkDraft("");
      setJustAdded(item.itemId);
      openEditor(item.itemId);
    },
    onError: () => setNotice("Couldn't add that link. Try again."),
  });

  const submitLink = (text: string) => {
    const url = extractLink(text);
    if (!safeHref(url)) {
      setNotice("Paste a full link, starting with https://");
      return;
    }
    setNotice(undefined);
    // The words around the link, if any, help name it when the shop's page can't be read
    addByLink.mutate({ url, text: text.trim() === url ? undefined : text });
  };

  // A link shared into gimme from another app (see ShareTarget) is added on arrival
  const sharedText = (location.state as { addText?: string } | null)?.addText;
  const handledSharedText = useRef(false);
  useEffect(() => {
    if (!sharedText || handledSharedText.current) return;
    handledSharedText.current = true;
    // So a refresh doesn't add it again
    navigate(location.pathname, { replace: true, state: null });
    submitLink(sharedText);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [sharedText]);

  const update = useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: ItemInput }) =>
      updateItem(listId, itemId, input),
    onSuccess: (saved) => {
      setItems((items) =>
        items.map((item) => (item.itemId === saved.itemId ? saved : item)),
      );
      refresh();
      closeEditor();
    },
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => deleteItem(listId, itemId),
    onSuccess: (_, itemId) => {
      setItems((items) => items.filter((item) => item.itemId !== itemId));
      refresh();
      closeEditor();
    },
  });

  // The tiles reorder instantly; the change is rolled back if saving it fails
  const move = useMutation({
    mutationFn: ({ itemId, position }: { itemId: string; position: string }) =>
      moveItem(listId, itemId, position),
    onMutate: async ({ itemId, position }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ListWithItems>(queryKey);
      setItems((items) =>
        sortByPosition(
          items.map((item) =>
            item.itemId === itemId ? { ...item, position } : item,
          ),
        ),
      );
      return { previous };
    },
    onError: (_err, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      setNotice("Couldn't move it. Try again.");
    },
  });

  const items = useMemo(() => list?.items ?? [], [list]);
  const tags = useMemo(() => collectTags(items), [items]);
  const budgets = useMemo(() => budgetOptions(items), [items]);
  const currency = useMemo(() => usualCurrency(items), [items]);
  const shown = useMemo(() => applyView(items, view), [items, view]);
  const groups = useMemo(
    () => groupItems(shown, view.groupBy),
    [shown, view.groupBy],
  );

  const settingsPath = `/lists/${listId}/settings`;
  const previewPath = `/lists/${listId}/preview`;

  const header = (
    <>
      {/* Phones: back to the lists, and this list's settings */}
      <div className="contents sm:hidden">
        <BackLink to="/lists">Lists</BackLink>
        <Link
          to={settingsPath}
          className="flex min-h-11 items-center hover:underline hover:underline-offset-3"
        >
          Settings
        </Link>
      </div>
      <div className="hidden sm:contents">
        <OwnerHeader />
      </div>
    </>
  );

  if (isPending || error) {
    const notFound = error instanceof ApiError && error.status === 404;

    return (
      <PageShell header={header}>
        {error && (
          <p className="text-muted">
            {notFound
              ? "This list doesn't exist anymore."
              : "Couldn't load this list."}{" "}
            {!notFound && (
              <button
                type="button"
                className="action text-ink"
                onClick={() => refetch()}
              >
                Try again
              </button>
            )}
          </p>
        )}
      </PageShell>
    );
  }

  const isPrivate = list.isPrivate === true;
  const empty = items.length === 0;
  const editing = items.find((item) => item.itemId === editingId);
  const panelOpen = wide && editing !== undefined;
  // Dragging only makes sense in the owner's own order, with nothing hidden or grouped
  const sortable =
    view.sort === "ranking" &&
    view.groupBy === "none" &&
    !isFiltered(view) &&
    items.length > 1;
  const customised = view.sort !== "ranking" || view.groupBy !== "none";

  const meta = [
    list.eventDate ? formatEventDate(list.eventDate) : "No date",
    countThings(items.length),
    isPrivate && "private",
  ]
    .filter(Boolean)
    .join(" · ");

  // The tile for a link that's being added
  const adding = addByLink.isPending && (
    <li aria-live="polite">
      <TileSquare veil="Adding…" />
      <p className="pt-2 pl-3 text-[13px] text-muted sm:pl-0">
        {siteName(addByLink.variables.url)}
      </p>
    </li>
  );

  const renderTiles = (group: Item[], withAdding = false) => (
    <OwnerTiles
      items={group}
      sortable={sortable}
      editingId={panelOpen ? editingId : undefined}
      narrow={panelOpen}
      onEdit={(item) => openEditor(item.itemId)}
      onMove={(itemId, position) => {
        setNotice(undefined);
        move.mutate({ itemId, position });
      }}
      onMoveFailed={() => setNotice("Couldn't move it. Reload and try again.")}
      extra={withAdding && adding}
    />
  );

  const editor = editing && (
    <ItemEditor
      key={editing.itemId}
      item={editing}
      headingId={editorHeadingId}
      existingTags={tags}
      currency={currency}
      justAdded={justAdded === editing.itemId}
      saving={update.isPending}
      saveFailed={update.isError}
      onSave={(input) => update.mutate({ itemId: editing.itemId, input })}
      removing={removeItem.isPending}
      removeFailed={removeItem.isError}
      onRemove={() => removeItem.mutate(editing.itemId)}
      onClose={closeEditor}
    />
  );

  const shareActions = !isPrivate && <ShareAction list={list} />;

  return (
    <>
      <PageShell
        header={header}
        // The edit panel runs from the header to the bottom, flush with the right edge
        mainClassName={
          panelOpen ? "lg:flex lg:pt-0 lg:pr-0 lg:pb-0" : undefined
        }
      >
        <div
          className={cn(panelOpen && "min-w-0 flex-1 lg:pt-8 lg:pr-8 lg:pb-16")}
        >
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div className="min-w-0">
              <h1 className="page-title">{list.title}</h1>
              <p className="mt-2.5 text-sm text-muted">{meta}</p>
            </div>
            <div className="hidden flex-wrap gap-x-6 text-sm sm:flex">
              {shareActions}
              <Link to={settingsPath} className="action">
                Settings
              </Link>
              <Link to={previewPath} className="action">
                See it as a guest
              </Link>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-5 text-sm sm:hidden">
            {shareActions}
            <Link to={previewPath} className="action">
              See it as a guest
            </Link>
          </div>

          <form
            noValidate
            className="mt-2.5 sm:mt-8"
            onSubmit={(event) => {
              event.preventDefault();
              submitLink(linkDraft);
            }}
          >
            <label htmlFor="add-link" className="sr-only">
              Add something by link
            </label>
            <input
              id="add-link"
              type="url"
              inputMode="url"
              enterKeyHint="go"
              autoComplete="off"
              placeholder="Paste a link to add something"
              // A new list has nothing else to do, so the cursor starts here (not on phones,
              // where it would cover the page with the keyboard)
              autoFocus={empty && window.matchMedia("(pointer: fine)").matches}
              value={addByLink.isPending ? addByLink.variables.url : linkDraft}
              disabled={addByLink.isPending}
              onChange={(event) => setLinkDraft(event.target.value)}
              // Pasting a link into the empty field is enough: no Enter needed
              onPaste={(event) => {
                const text = event.clipboardData.getData("text");
                if (linkDraft.trim() === "" && safeHref(extractLink(text))) {
                  event.preventDefault();
                  submitLink(text);
                }
              }}
              className={cn("field min-h-[52px] px-4", empty && "border-ink")}
            />
            {notice && (
              <p role="status" className="mt-2 text-[13px] font-medium">
                {notice}
              </p>
            )}
          </form>

          {empty && !addByLink.isPending ? (
            <>
              <div
                aria-hidden="true"
                className="-mx-4 mt-5 grid grid-cols-2 gap-0.5 sm:mx-0 sm:mt-8 sm:grid-cols-3 lg:grid-cols-4"
              >
                <TileSquare />
                <TileSquare />
              </div>
              <div className="mt-5 max-w-[560px] text-[15px] leading-normal">
                <p>
                  Copy a product link from any shop and paste it above. We'll
                  fill in the name, photo and price.
                </p>
                <p className="mt-3 text-muted">
                  On Android you can also tap Share in a shop's app and pick
                  gimme.
                </p>
              </div>
            </>
          ) : (
            <>
              {!empty && (
                <div className="mt-4 sm:mt-6">
                  <ListControls
                    view={view}
                    onChange={setView}
                    tags={tags}
                    rankingLabel="My order"
                    availableLabel={
                      items.some((item) => item.got) ? "Not got yet" : undefined
                    }
                    showStarred={items.some((item) => item.starred)}
                    budgets={budgets}
                    shownCount={shown.length}
                    totalCount={items.length}
                  />
                </div>
              )}

              <div className="mt-4 sm:mt-6">
                {shown.length === 0 && !addByLink.isPending ? (
                  <p className="text-muted">Nothing matches.</p>
                ) : view.groupBy === "none" ? (
                  renderTiles(shown, true)
                ) : (
                  <div className="grid gap-10">
                    <GroupedItems groups={groups} render={renderTiles} />
                    {adding && <TileGrid narrow={panelOpen}>{adding}</TileGrid>}
                  </div>
                )}
              </div>

              {/* Says why tiles stopped moving */}
              {!sortable &&
                items.length > 1 &&
                (customised || isFiltered(view)) && (
                  <p className="mt-8 text-[13px] text-muted">
                    Drag to reorder in My order, with nothing filtered or
                    grouped.
                  </p>
                )}
            </>
          )}
        </div>

        {panelOpen && (
          <aside
            aria-labelledby={editorHeadingId}
            className="w-[440px] shrink-0 border-l border-hairline bg-field"
          >
            {/* Fits the screen below the header, and stays in view while the list scrolls */}
            <div className="sticky top-0 max-h-[calc(100svh-3.75rem)] overflow-y-auto px-7 pt-7 pb-8">
              {editor}
            </div>
          </aside>
        )}
      </PageShell>

      {/* Phones and narrow windows: the editor takes the whole screen */}
      {!wide && (
        <Modal
          open={editing !== undefined}
          onClose={closeEditor}
          labelledBy={editorHeadingId}
          className="h-full max-h-none w-full max-w-none bg-ground"
        >
          <div className="mx-auto max-w-[640px] px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[max(32px,env(safe-area-inset-bottom))] sm:px-8">
            {editor}
          </div>
        </Modal>
      )}
    </>
  );
}
