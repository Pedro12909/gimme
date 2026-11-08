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
import { Composer, type ComposerPrefill } from "@/components/composer";
import { Sheet } from "@/components/sheet";
import { Bone, Loading, TileGridBones } from "@/components/skeleton";
import { useTwoStep } from "@/components/two-step";
import { rememberOwnShareTokens } from "@/lib/guest-storage";
import { ApiError } from "@/lib/http";
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
import { FULL_NOTICE, MAX_ITEMS_PER_LIST } from "@/lib/limits";
import {
  deleteList,
  moveItem,
  newShareLink,
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
  listKey,
  listPath,
  listsKey,
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

const EMPTY: Record<ItemsView | "list", string> = {
  list: "Nothing here yet. Add something with +.",
  all: "Nothing here yet. Add something with +.",
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

  // Escape closes the panel (menus and dialogs, like the composer, close themselves first)
  useEffect(() => {
    if (!selectedId || !wide) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.querySelector("dialog[open]")
      ) {
        close();
      }
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

  // The composer: closed when undefined. It opens from the + button, the N key, a link
  // pasted outside any field, or a link shared into the app, and never adds on its own.
  const [composer, setComposer] = useState<{ prefill?: ComposerPrefill }>();
  const openComposer = (prefill?: ComposerPrefill) =>
    setComposer((current) => current ?? { prefill });

  // ⌘Enter in the composer: the new item opens in the panel, in its own list when this
  // screen wouldn't show it
  const openAdded = (item: Item) => {
    setComposer(undefined);
    const shownHere =
      selection.kind === "list"
        ? item.listId === listId
        : selection.view === "all" ||
          (selection.view === "want" && item.starred);
    if (shownHere) {
      select(item.itemId);
    } else {
      navigate(
        `${listPath(item.listId, item.listId === defaultListId)}?item=${encodeURIComponent(item.itemId)}`,
      );
    }
  };

  // Typing elsewhere, a dialog or a menu open: the shortcuts stand aside
  const busyElsewhere = (target: EventTarget | null) =>
    Boolean(
      (target as Element | null)?.closest?.(
        "input, textarea, select, [contenteditable]",
      ) || document.querySelector("dialog[open], [role=menu]"),
    );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "n" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        busyElsewhere(event.target)
      ) {
        return;
      }
      event.preventDefault();
      openComposer();
    };
    // A link pasted outside any field opens the composer with it; the item panel handles
    // pasted photos first
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || busyElsewhere(event.target)) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!/https?:\/\/\S+/.test(text)) return;
      event.preventDefault();
      openComposer({ text });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  // A link shared into gimme from another app (see ShareTarget) opens the composer with it
  const arrival = location.state as {
    addText?: string;
    rename?: boolean;
  } | null;
  const handledShare = useRef(false);
  useEffect(() => {
    if (!arrival?.addText || handledShare.current) return;
    handledShare.current = true;
    // So a refresh doesn't open it again
    navigate(location.pathname, { replace: true, state: null });
    openComposer({ text: arrival.addText });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [arrival?.addText]);

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

  const renderTiles = (group: Item[]) => (
    <OwnerTiles
      items={group}
      sortable={sortable}
      selectedId={selectedId}
      // A tile still being saved has nothing to open yet
      onSelect={(item) =>
        !item.itemId.startsWith("adding-") && select(item.itemId)
      }
      onMove={(itemId, position) => {
        setNotice(undefined);
        reorder.mutate({ itemId, position });
      }}
      onMoveFailed={() => setNotice("Couldn't move it. Reload and try again.")}
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

  const empty = items.length === 0;
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
            />
          </div>
          <SortMenu
            sort={view.sort}
            groupBy={view.groupBy}
            rankingLabel={selection.kind === "list" ? "My order" : "By list"}
            onChange={(change) => setView({ ...view, ...change })}
          />
          <button
            type="button"
            aria-label="Add an item"
            title="Add an item (N)"
            aria-haspopup="dialog"
            onClick={() => openComposer()}
            className="hidden size-12 flex-none items-center justify-center rounded-card bg-accent text-accent-on transition-colors hover:bg-accent-hover lg:flex"
          >
            <Icon name="plus" size={22} />
          </button>
        </div>
        {(notice || full) && (
          <p role="status" className="text-[13px] text-muted">
            {notice ?? FULL_NOTICE}
          </p>
        )}
      </div>

      {empty ? (
        <p className="text-muted">{emptyText}</p>
      ) : shown.length === 0 ? (
        <p className="text-muted">
          {searching
            ? `Nothing matches “${view.query.trim()}”.`
            : "Nothing matches."}
        </p>
      ) : view.groupBy === "none" ? (
        renderTiles(shown)
      ) : (
        <div className="grid gap-10">
          <GroupedItems groups={groups} render={renderTiles} />
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

      {/* Phones: a floating + adds */}
      {!wide && (
        <button
          type="button"
          aria-label="Add an item"
          title="Add an item"
          aria-haspopup="dialog"
          onClick={() => openComposer()}
          className="fixed right-5 bottom-[max(34px,calc(env(safe-area-inset-bottom)+16px))] z-20 flex size-14 items-center justify-center rounded-full bg-accent text-accent-on shadow-[0_12px_32px_rgba(0,0,0,.18)] transition-colors hover:bg-accent-hover"
        >
          <Icon name="plus" size={24} />
        </button>
      )}

      <Composer
        open={composer !== undefined}
        onClose={() => setComposer(undefined)}
        wide={wide}
        lists={lists}
        defaultListId={defaultListId}
        initialListId={listId}
        prefill={composer?.prefill}
        onOpenItem={openAdded}
      />

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
