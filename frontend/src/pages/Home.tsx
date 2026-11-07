import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { GroupedItems } from "@/components/grouped-items";
import { Icon, IconButton } from "@/components/icon";
import { ItemPanel } from "@/components/item-panel";
import {
  Menu,
  MenuDivider,
  MenuItem,
  MenuLabel,
  MenuNote,
} from "@/components/menu";
import { OwnerTiles } from "@/components/owner-tiles";
import { SearchBox } from "@/components/search-box";
import { Sheet } from "@/components/sheet";
import { Bone, Loading, TileGridBones } from "@/components/skeleton";
import { TileGrid, TileSquare } from "@/components/tile";
import { useTwoStep } from "@/components/two-step";
import { rememberOwnShareTokens } from "@/lib/guest-storage";
import { ApiError } from "@/lib/http";
import { extractLink, newItemInput } from "@/lib/item-input";
import { sortByPosition } from "@/lib/item-order";
import {
  collectTags,
  applyView,
  GROUP_LABELS,
  groupItems,
  SORT_LABELS,
  usualCurrency,
  type GroupBy,
  type SortKey,
} from "@/lib/item-view";
import { safeHref, siteName } from "@/lib/links";
import { MAX_ITEMS_PER_LIST } from "@/lib/limits";
import {
  addItem,
  deleteList,
  moveItem,
  newShareLink,
  previewLink,
  setDefaultList,
  shareUrl,
  updateList,
  type Item,
  type ItemsView,
  type Lists,
  type ListSummary,
  type ListWithItems,
} from "@/lib/owner-api";
import {
  addItemToCache,
  listKey,
  listPath,
  listsKey,
  refreshCounts,
  useList,
  useLists,
  useViewItems,
  VIEW_PATHS,
  VIEW_TITLES,
  type Selection,
} from "@/lib/owner-data";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useListView } from "@/lib/use-list-view";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

// The signed-in app: a list (the default one at /) or a view across lists, with the
// selected item in a panel beside it (design/home-redesign.md).

const viewFromPath = (pathname: string) =>
  (Object.keys(VIEW_PATHS) as ItemsView[]).find(
    (view) => VIEW_PATHS[view] === pathname,
  );

const FULL_NOTICE = `This list has ${MAX_ITEMS_PER_LIST} items, the most it can hold. Remove one to add another.`;

const EMPTY: Record<ItemsView | "list", string> = {
  list: "Nothing here yet. Copy a product link from any shop and paste it on this page.",
  all: "Nothing here yet. Copy a product link from any shop and paste it on this page.",
  want: "No items marked Want most.",
  got: "Nothing marked Got it yet.",
};

// Phones get the system share sheet (WhatsApp, Messages…); elsewhere the link is copied
const sharesNatively = () =>
  typeof navigator.share === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

function ShareButton({ list }: { list: ListWithItems }) {
  const [result, setResult] = useState<"copied" | "failed">();
  const url = shareUrl(list.shareToken);

  useEffect(() => {
    if (result !== "copied") return;
    const timer = setTimeout(() => setResult(undefined), 1500);
    return () => clearTimeout(timer);
  }, [result]);

  if (list.isPrivate) {
    return (
      <IconButton
        icon="share"
        label="This list is private. Make it public to share it."
        disabled
      />
    );
  }

  const share = async () => {
    if (sharesNatively()) {
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
    <div className="flex items-center gap-1">
      {result && (
        <span
          role="status"
          className={cn(
            "text-[13px] text-muted",
            result === "failed" && "max-w-[40vw] truncate select-all",
          )}
        >
          {result === "copied" ? "Copied" : url}
        </span>
      )}
      <IconButton icon="share" label="Copy share link" onClick={share} />
    </div>
  );
}

function SortMenu({
  sort,
  groupBy,
  rankingLabel,
  onChange,
}: {
  sort: SortKey;
  groupBy: GroupBy;
  rankingLabel: string;
  onChange: (change: { sort?: SortKey; groupBy?: GroupBy }) => void;
}) {
  const sorts: [SortKey, string][] = [
    ["ranking", rankingLabel],
    ...(Object.entries(SORT_LABELS) as [SortKey, string][]),
  ];
  return (
    <Menu
      label="Sort and group"
      trigger={(props) => (
        // Same height and surface as the search box it sits beside
        <IconButton
          icon="sliders"
          label="Sort and group"
          className="size-[46px] rounded-card bg-surface hover:bg-surface-2 aria-expanded:bg-surface-2 lg:size-12"
          {...props}
        />
      )}
    >
      <MenuLabel>Sort</MenuLabel>
      {sorts.map(([value, label]) => (
        <MenuItem
          key={value}
          checked={sort === value}
          onSelect={() => onChange({ sort: value })}
        >
          {label}
          {sort === value && (
            <Icon name="check" size={15} className="ml-auto" />
          )}
        </MenuItem>
      ))}
      <MenuDivider />
      <MenuLabel>Group</MenuLabel>
      {(Object.keys(GROUP_LABELS) as GroupBy[]).map((value) => (
        <MenuItem
          key={value}
          checked={groupBy === value}
          onSelect={() => onChange({ groupBy: value })}
        >
          {GROUP_LABELS[value]}
          {groupBy === value && (
            <Icon name="check" size={15} className="ml-auto" />
          )}
        </MenuItem>
      ))}
    </Menu>
  );
}

function ListOptions({
  list,
  onlyList,
  onRename,
}: {
  list: ListWithItems;
  onlyList: boolean;
  onRename: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<string>();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: listKey(list.listId) });
    queryClient.invalidateQueries({ queryKey: listsKey });
  };
  const failed = (text: string) => () => setProblem(text);

  const makeDefault = useMutation({
    mutationFn: () => setDefaultList(list.listId),
    onSuccess: () => {
      // The house moves at once, so / opens this list straight away
      queryClient.setQueryData<Lists>(
        listsKey,
        (current) =>
          current && {
            defaultListId: list.listId,
            lists: current.lists.map((other) => ({
              ...other,
              isDefault: other.listId === list.listId,
            })),
          },
      );
      queryClient.setQueryData<ListWithItems>(
        listKey(list.listId),
        (current) => current && { ...current, isDefault: true },
      );
      refresh();
      // This list now lives at /
      navigate("/", { replace: true });
    },
    onError: failed("Couldn't change which list opens first. Try again."),
  });
  const setPrivate = useMutation({
    mutationFn: (isPrivate: boolean) => updateList(list.listId, { isPrivate }),
    onSuccess: refresh,
    onError: failed("Couldn't change who can see it. Try again."),
  });
  const rotate = useMutation({
    mutationFn: () => newShareLink(list.listId),
    onSuccess: ({ shareToken }) => {
      rememberOwnShareTokens([shareToken]);
      refresh();
      setProblem("Done. Send the new link to your guests again.");
    },
    onError: failed("Couldn't make a new link. Try again."),
  });
  const remove = useMutation({
    mutationFn: async () => {
      await deleteList(list.listId);
      // Deleting the default moves it, so / needs the new one before going there
      await queryClient.refetchQueries({ queryKey: listsKey });
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: listKey(list.listId) });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      navigate("/", { replace: true });
    },
    onError: (err) =>
      setProblem(
        err instanceof ApiError && err.code === "LAST_LIST"
          ? "Your only list can't be deleted."
          : "Couldn't delete the list. Try again.",
      ),
  });
  const confirmRotate = useTwoStep(() => rotate.mutate());
  const confirmDelete = useTwoStep(() => remove.mutate());

  return (
    <div className="flex items-center">
      {problem && (
        <span role="status" className="mr-1 text-[13px] text-muted">
          {problem}
        </span>
      )}
      <Menu
        label="List options"
        trigger={(props) => (
          <IconButton
            icon="more"
            label="List options"
            {...props}
            onClick={() => {
              setProblem(undefined);
              confirmRotate.cancel();
              confirmDelete.cancel();
              props.onClick();
            }}
          />
        )}
      >
        <MenuItem onSelect={() => navigate(`/lists/${list.listId}/preview`)}>
          See it as a guest
        </MenuItem>
        <MenuItem onSelect={onRename}>Rename</MenuItem>
        <MenuItem onSelect={() => navigate(`/lists/${list.listId}/settings`)}>
          Date and note for guests
        </MenuItem>
        {!list.isDefault && (
          <MenuItem onSelect={() => makeDefault.mutate()}>
            Open this list first
          </MenuItem>
        )}
        <MenuItem onSelect={() => setPrivate.mutate(!list.isPrivate)}>
          {list.isPrivate ? "Make public" : "Make private"}
        </MenuItem>
        {!list.isPrivate && (
          <MenuItem
            keepOpen={!confirmRotate.armed}
            onSelect={confirmRotate.press}
            className={cn(confirmRotate.armed && "text-danger")}
          >
            {confirmRotate.armed
              ? "New link? The old one stops working"
              : "New share link"}
          </MenuItem>
        )}
        <MenuDivider />
        {onlyList ? (
          <MenuNote>Your only list can't be deleted.</MenuNote>
        ) : (
          <MenuItem
            keepOpen={!confirmDelete.armed}
            onSelect={confirmDelete.press}
            className={cn(confirmDelete.armed && "font-semibold text-danger")}
          >
            {confirmDelete.armed ? "Delete list?" : "Delete list"}
          </MenuItem>
        )}
      </Menu>
    </div>
  );
}

// The list's name, renamed in place
function ListTitle({
  list,
  renaming,
  onDone,
}: {
  list: ListWithItems;
  renaming: boolean;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  // Here rather than in the field, so the save outlives the field closing
  const rename = useMutation({
    mutationFn: (title: string) => updateList(list.listId, { title }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey(list.listId) });
      queryClient.invalidateQueries({ queryKey: listsKey });
    },
  });

  if (!renaming) {
    return <h1 className="page-title min-w-0">{list.title}</h1>;
  }

  return (
    <RenameField
      title={list.title}
      onDone={(title) => {
        if (title && title !== list.title) {
          // Shown at once; the save follows
          queryClient.setQueryData<ListWithItems>(
            listKey(list.listId),
            (current) => current && { ...current, title },
          );
          rename.mutate(title);
        }
        onDone();
      }}
    />
  );
}

// Starts with the current name each time it opens. Escape keeps the old name.
function RenameField({
  title,
  onDone,
}: {
  title: string;
  onDone: (title: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(title);
  const cancelled = useRef(false);

  return (
    <input
      aria-label="List name"
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      value={draft}
      maxLength={100}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onDone(cancelled.current ? undefined : draft.trim())}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.stopPropagation();
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      className="page-title -mx-2 min-w-0 flex-1 rounded-sm bg-surface px-2"
    />
  );
}

function Screen({
  selection,
  lists,
  defaultListId,
}: {
  selection: Selection;
  lists: ListSummary[];
  defaultListId: string | undefined;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const wide = useMediaQuery("(min-width: 1024px)");
  const panelHeading = useId();

  const listId = selection.kind === "list" ? selection.listId : undefined;
  const viewName = selection.kind === "view" ? selection.view : undefined;
  const listQuery = useList(listId);
  const viewQuery = useViewItems(viewName);
  const list = listQuery.data;
  const query = selection.kind === "list" ? listQuery : viewQuery;
  const items: Item[] = useMemo(
    () => (selection.kind === "list" ? list?.items : viewQuery.data) ?? [],
    [selection.kind, list, viewQuery.data],
  );

  const [view, setView] = useListView(listId ?? `view:${viewName}`);
  const title =
    selection.kind === "list" ? list?.title : VIEW_TITLES[selection.view];
  useDocumentTitle(title);

  // Covers links made since the app last loaded them
  useEffect(() => {
    if (list) rememberOwnShareTokens([list.shareToken]);
  }, [list]);

  // --- The selected item lives in the URL, so Back closes it ---------------------------
  const selectedId =
    new URLSearchParams(location.search).get("item") ?? undefined;
  const select = (itemId: string) =>
    navigate(
      { search: `?item=${encodeURIComponent(itemId)}` },
      { replace: selectedId !== undefined, state: { panelOpened: true } },
    );
  const close = () => {
    if ((location.state as { panelOpened?: boolean } | null)?.panelOpened) {
      navigate(-1);
    } else {
      navigate({ search: "" }, { replace: true });
    }
  };
  const selected = items.find((item) => item.itemId === selectedId);

  // An item removed elsewhere (another tab) closes its panel
  useEffect(() => {
    if (selectedId && query.isSuccess && !selected && !query.isFetching) {
      navigate({ search: "" }, { replace: true });
    }
  }, [selectedId, selected, query.isSuccess, query.isFetching, navigate]);

  // Escape closes the panel (menus close themselves first)
  useEffect(() => {
    if (!selectedId || !wide) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // --- Adding -------------------------------------------------------------------------
  // On a view, links go to the default list
  const targetListId = listId ?? defaultListId;
  const target = lists.find((other) => other.listId === targetListId);
  const full =
    selection.kind === "list"
      ? items.length >= MAX_ITEMS_PER_LIST
      : (target?.itemCount ?? 0) >= MAX_ITEMS_PER_LIST;
  const [notice, setNotice] = useState<string>();

  const addByLink = useMutation({
    mutationFn: async ({ url, text }: { url: string; text?: string }) => {
      // A shop that blocks the preview still gets an item, named from its link
      const preview = await previewLink(url, text).catch(() => undefined);
      return addItem(targetListId!, newItemInput(url, preview));
    },
    onSuccess: (item) => {
      addItemToCache(queryClient, item);
      refreshCounts(queryClient);
      setView((current) => ({ ...current, query: "" }));
      if (selection.kind === "list" || selection.view === "all") {
        select(item.itemId);
      } else {
        // Want most and Got it wouldn't show it, so open it in its list
        navigate(
          `${listPath(item.listId, item.listId === defaultListId)}?item=${encodeURIComponent(item.itemId)}`,
        );
      }
    },
    onError: (err) =>
      setNotice(
        err instanceof ApiError && err.status === 409
          ? FULL_NOTICE
          : "Couldn't add that link. Try again.",
      ),
  });

  const add = (text: string) => {
    if (addByLink.isPending) return;
    if (full) {
      setNotice(FULL_NOTICE);
      return;
    }
    const url = extractLink(text);
    if (!safeHref(url) || !targetListId) {
      setNotice("Paste a full link, starting with https://");
      return;
    }
    setNotice(undefined);
    // The words around the link, if any, help name it when the shop's page can't be read
    addByLink.mutate({ url, text: text.trim() === url ? undefined : text });
  };

  // For now (until the add button is designed), a product link pasted anywhere outside a
  // text field adds it. The item panel handles pasted photos first.
  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  });
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      const inField = (event.target as Element | null)?.closest?.(
        "input, textarea, [contenteditable]",
      );
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (inField || !/https?:\/\/\S+/.test(text)) return;
      event.preventDefault();
      addRef.current(text);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // A link shared into gimme from another app (see ShareTarget) is added on arrival
  const arrival = location.state as {
    addText?: string;
    rename?: boolean;
  } | null;
  const handledShare = useRef(false);
  useEffect(() => {
    if (!arrival?.addText || handledShare.current || !targetListId) return;
    handledShare.current = true;
    // So a refresh doesn't add it again
    navigate(location.pathname, { replace: true, state: null });
    add(arrival.addText);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [arrival?.addText, targetListId]);

  // A list made a moment ago opens with its name ready to type
  const [renaming, setRenaming] = useState(arrival?.rename === true);

  // --- Reordering ---------------------------------------------------------------------
  const reorder = useMutation({
    mutationFn: ({ itemId, position }: { itemId: string; position: string }) =>
      moveItem(listId!, itemId, position),
    onMutate: async ({ itemId, position }) => {
      const key = listKey(listId!);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ListWithItems>(key);
      queryClient.setQueryData<ListWithItems>(
        key,
        (current) =>
          current && {
            ...current,
            items: sortByPosition(
              current.items.map((item) =>
                item.itemId === itemId ? { ...item, position } : item,
              ),
            ),
          },
      );
      return { previous };
    },
    onError: (_err, _variables, context) => {
      queryClient.setQueryData(listKey(listId!), context?.previous);
      setNotice("Couldn't move it. Try again.");
    },
  });

  const tags = useMemo(() => collectTags(items), [items]);
  const currency = useMemo(() => usualCurrency(items), [items]);
  const shown = useMemo(() => applyView(items, view), [items, view]);
  const groups = useMemo(
    () => groupItems(shown, view.groupBy),
    [shown, view.groupBy],
  );
  const searching = view.query.trim() !== "";
  const sortable =
    selection.kind === "list" &&
    view.sort === "ranking" &&
    view.groupBy === "none" &&
    !searching &&
    items.length > 1;

  // --- Rendering ----------------------------------------------------------------------
  const gone =
    listQuery.error instanceof ApiError && listQuery.error.status === 404;
  const atRoot = location.pathname === "/";
  // At / the default itself is gone (deleted in another tab): asking for the lists again
  // gets the new default, which the API sorts out
  useEffect(() => {
    if (gone && atRoot) queryClient.invalidateQueries({ queryKey: listsKey });
  }, [gone, atRoot, queryClient]);
  if (gone && !atRoot) {
    // A list that's gone (or never was) falls back to the default
    return <Navigate to="/" replace />;
  }

  const current: Selection = selection;
  if (query.isPending || query.error) {
    return (
      <AppShell current={current}>
        {query.error ? (
          <p className="text-muted">
            Couldn't load this.{" "}
            <button
              type="button"
              className="action"
              onClick={() => query.refetch()}
            >
              Try again
            </button>
          </p>
        ) : (
          <Loading label="Loading" className="flex flex-col gap-6">
            <Bone className="h-9 w-56" />
            <Bone className="h-12 w-full rounded-card" />
            <TileGridBones />
          </Loading>
        )}
      </AppShell>
    );
  }

  const adding = addByLink.isPending && (
    <li aria-live="polite">
      <TileSquare />
      <p className="truncate pt-2.5 text-[13px] text-muted">
        Adding from {siteName(addByLink.variables.url)}…
      </p>
    </li>
  );

  const renderTiles = (group: Item[], withAdding = false) => (
    <OwnerTiles
      items={group}
      sortable={sortable}
      selectedId={selectedId}
      onSelect={(item) => select(item.itemId)}
      onMove={(itemId, position) => {
        setNotice(undefined);
        reorder.mutate({ itemId, position });
      }}
      onMoveFailed={() => setNotice("Couldn't move it. Reload and try again.")}
      extra={withAdding && adding}
    />
  );

  const panel = selected ? (
    <ItemPanel
      key={`${selected.listId}:${selected.itemId}`}
      item={selected}
      lists={lists}
      existingTags={tags}
      currency={currency}
      headingId={panelHeading}
      onClose={close}
    />
  ) : undefined;

  const empty = items.length === 0 && !addByLink.isPending;
  const emptyText = EMPTY[selection.kind === "list" ? "list" : selection.view];

  return (
    <AppShell
      current={current}
      aside={
        wide &&
        panel && (
          // Wide screens: grows open, so the shelf makes room gradually. Narrower ones: slides
          // in over the shelf.
          <aside
            aria-label="Selected item"
            className="sticky top-0 h-dvh w-(--panel-width) flex-none overflow-hidden border-l border-hairline bg-ground max-xl:fixed max-xl:right-0 max-xl:z-30 max-xl:animate-panel-in max-xl:shadow-menu xl:animate-panel-grow"
          >
            <div className="h-full w-(--panel-width) overflow-y-auto px-6 pt-5 pb-8 xl:animate-panel-in">
              {panel}
            </div>
          </aside>
        )
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          {selection.kind === "list" && list ? (
            <ListTitle
              list={list}
              renaming={renaming}
              onDone={() => setRenaming(false)}
            />
          ) : (
            <h1 className="page-title min-w-0">{title}</h1>
          )}
          {!renaming && (
            <span className="text-[15px] text-muted tabular-nums">
              {items.length}
            </span>
          )}
        </div>
        <div className="flex flex-none items-center gap-0.5">
          {list && <ShareButton list={list} />}
          {list && (
            <ListOptions
              list={list}
              onlyList={lists.length <= 1}
              onRename={() => setRenaming(true)}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <SearchBox
              value={view.query}
              onChange={(query) => {
                setNotice(undefined);
                setView({ ...view, query });
              }}
              autoFocus={empty}
            />
          </div>
          <SortMenu
            sort={view.sort}
            groupBy={view.groupBy}
            rankingLabel={selection.kind === "list" ? "My order" : "By list"}
            onChange={(change) => setView({ ...view, ...change })}
          />
        </div>
        {(notice || full) && (
          <p role="status" className="text-[13px] text-muted">
            {notice ?? FULL_NOTICE}
          </p>
        )}
      </div>

      {empty ? (
        <p className="text-muted">{emptyText}</p>
      ) : shown.length === 0 && !addByLink.isPending ? (
        <p className="text-muted">
          {searching
            ? `Nothing matches “${view.query.trim()}”.`
            : "Nothing matches."}
        </p>
      ) : view.groupBy === "none" ? (
        renderTiles(shown, true)
      ) : (
        <div className="grid gap-10">
          <GroupedItems groups={groups} render={renderTiles} />
          {adding && <TileGrid>{adding}</TileGrid>}
        </div>
      )}

      {/* Says why tiles stopped moving */}
      {selection.kind === "list" && !sortable && items.length > 1 && (
        <p className="text-[13px] text-muted">
          Drag to reorder in My order, with nothing searched or grouped.
        </p>
      )}

      {selection.kind === "view" && target && (
        <p className="text-[13px] text-muted">
          Links added here go to{" "}
          <Link
            to={listPath(target.listId, target.isDefault)}
            className="text-ink underline underline-offset-3"
          >
            {target.title}
          </Link>
          .
        </p>
      )}

      {/* Phones: the item opens in a bottom sheet */}
      {!wide && (
        <Sheet
          open={panel !== undefined}
          onClose={close}
          labelledBy={panelHeading}
        >
          {panel}
        </Sheet>
      )}
    </AppShell>
  );
}

export default function Home() {
  const { listId: paramId } = useParams();
  const location = useLocation();
  const viewName = viewFromPath(location.pathname);
  const { data, error, refetch } = useLists();

  useEffect(() => {
    if (data)
      rememberOwnShareTokens(
        data.lists.map((list) => list.shareToken),
        true,
      );
  }, [data]);

  // / waits for the lists to know which is the default; other lists and views don't
  const listId = viewName ? undefined : (paramId ?? data?.defaultListId);
  const selection: Selection | undefined = viewName
    ? { kind: "view", view: viewName }
    : listId
      ? { kind: "list", listId }
      : undefined;

  if (!selection) {
    return (
      <AppShell current={undefined}>
        {error ? (
          <p className="text-muted">
            Couldn't load your lists.{" "}
            <button type="button" className="action" onClick={() => refetch()}>
              Try again
            </button>
          </p>
        ) : (
          <Loading label="Loading your list" className="flex flex-col gap-6">
            <Bone className="h-9 w-56" />
            <Bone className="h-12 w-full rounded-card" />
            <TileGridBones />
          </Loading>
        )}
      </AppShell>
    );
  }

  return (
    <Screen
      // Each list or view starts with its own search, selection and rename state
      key={selection.kind === "list" ? selection.listId : selection.view}
      selection={selection}
      lists={data?.lists ?? []}
      defaultListId={data?.defaultListId}
    />
  );
}
