import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  LockIcon,
  MoreHorizontalIcon,
  PlusIcon,
  ShareIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { GroupedItems } from "@/components/grouped-items";
import { ItemCard, ItemGrid } from "@/components/item-card";
import { ListControls } from "@/components/list-controls";
import { ItemFormSheet, ListFormSheet } from "@/components/owner-forms";
import { OwnerItemList } from "@/components/owner-item-list";
import { PageShell } from "@/components/page-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { describeEventDate } from "@/lib/event-date";
import { rememberOwnShareTokens } from "@/lib/guest-storage";
import { ApiError } from "@/lib/http";
import { useDocumentTitle } from "@/lib/use-document-title";
import { sortByPosition } from "@/lib/item-order";
import {
  applyView,
  budgetOptions,
  collectTags,
  groupItems,
  isFiltered,
  itemLabel,
  usualCurrency,
} from "@/lib/item-view";
import { useListView } from "@/lib/use-list-view";
import { cn } from "@/lib/utils";
import {
  addItem,
  deleteItem,
  deleteList,
  getList,
  moveItem,
  newShareLink,
  shareUrl,
  updateItem,
  updateList,
  type Item,
  type ItemInput,
  type ListWithItems,
} from "@/lib/owner-api";

type Dialog = "editList" | "deleteList" | "newLink" | "deleteItem" | undefined;

async function share(list: ListWithItems) {
  const url = shareUrl(list.shareToken);

  // Phones get the system share sheet (WhatsApp, Messages…); elsewhere the link is copied
  if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title: list.title, url });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied");
  } catch {
    toast(url);
  }
}

const toInput = (item: Item): ItemInput => ({
  url: item.url,
  title: item.title ?? "",
  note: item.note ?? "",
  imageUrl: item.imageUrl ?? "",
  price: item.price ?? "",
  vendor: item.vendor ?? "",
  size: item.size ?? "",
  alternatives: item.alternatives ?? [],
  tags: item.tags ?? [],
  starred: item.starred ?? false,
  got: item.got ?? false,
});

export default function ListDetail() {
  const { listId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // A link shared into gimme from another app arrives here, ready to add
  const sharedUrl = (location.state as { addUrl?: string } | null)?.addUrl;
  const [adding, setAdding] = useState(sharedUrl !== undefined);
  const [editing, setEditing] = useState<Item>();
  const [dialog, setDialog] = useState<Dialog>();
  const [view, setView] = useListView(listId);

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

  const saveFailed = () => toast.error("Couldn't save. Try again.");

  const add = useMutation({
    mutationFn: (input: ItemInput) => addItem(listId, input),
    onSuccess: () => {
      setAdding(false);
      refresh();
    },
    onError: saveFailed,
  });

  const update = useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: ItemInput }) =>
      updateItem(listId, itemId, input),
    onSuccess: () => {
      setEditing(undefined);
      refresh();
    },
    onError: saveFailed,
  });

  // The list reorders instantly; the change is rolled back if saving it fails
  const move = useMutation({
    mutationFn: ({ itemId, position }: { itemId: string; position: string }) =>
      moveItem(listId, itemId, position),
    onMutate: async ({ itemId, position }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ListWithItems>(queryKey);
      queryClient.setQueryData<ListWithItems>(
        queryKey,
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
      queryClient.setQueryData(queryKey, context?.previous);
      toast.error("Couldn't move the item. Try again.");
    },
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => deleteItem(listId, itemId),
    onSuccess: () => {
      setEditing(undefined);
      refresh();
    },
    onError: () => toast.error("Couldn't delete the item. Try again."),
  });

  const editList = useMutation({
    mutationFn: (input: Parameters<typeof updateList>[1]) =>
      updateList(listId, input),
    onSuccess: () => {
      setDialog(undefined);
      refresh();
    },
    onError: saveFailed,
  });

  const removeList = useMutation({
    mutationFn: () => deleteList(listId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      toast("List deleted");
      navigate("/lists", { replace: true });
    },
    onError: () => toast.error("Couldn't delete the list. Try again."),
  });

  const rotateLink = useMutation({
    mutationFn: () => newShareLink(listId),
    onSuccess: () => {
      refresh();
      toast("Share link replaced. The old one no longer works.");
    },
    onError: () => toast.error("Couldn't replace the link. Try again."),
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

  const backLink = (
    <Button asChild variant="ghost" size="lg" className="-ml-3">
      <Link to="/lists">
        <ChevronLeftIcon />
        Lists
      </Link>
    </Button>
  );

  if (isPending || error) {
    const notFound = error instanceof ApiError && error.status === 404;

    return (
      <PageShell header={backLink}>
        {isPending ? (
          <>
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="mt-8 h-11 w-full" />
            <div className="mt-8 space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </>
        ) : (
          <div className="py-24 text-center">
            <p className="text-muted-foreground">
              {notFound
                ? "This list doesn't exist anymore."
                : "Couldn't load this list."}
            </p>
            {!notFound && (
              <Button
                variant="outline"
                size="lg"
                className="mt-6"
                onClick={() => refetch()}
              >
                Try again
              </Button>
            )}
          </div>
        )}
      </PageShell>
    );
  }

  const empty = items.length === 0;
  const grid = view.layout === "grid";
  // Dragging only makes sense in a plain list in the owner's own order, with nothing hidden
  // or grouped, and something to move past
  const sortable =
    !grid &&
    view.sort === "ranking" &&
    view.groupBy === "none" &&
    !isFiltered(view) &&
    items.length > 1;
  const isPrivate = list.isPrivate === true;

  const renderItems = (group: Item[]) =>
    grid ? (
      <ItemGrid>
        {group.map((item) => (
          <ItemCard
            key={item.itemId}
            item={item}
            onOpen={() => setEditing(item)}
            dimmed={item.got}
            status={item.got ? "Got it" : undefined}
          />
        ))}
      </ItemGrid>
    ) : (
      <OwnerItemList
        items={group}
        sortable={sortable}
        grouped={view.groupBy !== "none"}
        onEdit={setEditing}
        onMove={(itemId, position) => move.mutate({ itemId, position })}
      />
    );

  return (
    <PageShell
      wide={grid}
      header={
        <>
          {backLink}
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label="List options"
                >
                  <MoreHorizontalIcon className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem onSelect={() => setDialog("editList")}>
                  Edit list
                </DropdownMenuItem>
                {!empty && !isPrivate && (
                  <DropdownMenuItem onSelect={() => setDialog("newLink")}>
                    Replace share link
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDialog("deleteList")}
                >
                  Delete list
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      }
    >
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {list.title}
      </h1>
      {list.eventDate && (
        <p className="mt-1 text-sm font-medium">
          {describeEventDate(list.eventDate)}
        </p>
      )}
      {list.description && (
        <p className="mt-2 text-muted-foreground text-pretty">
          {list.description}
        </p>
      )}
      {isPrivate && (
        // Also the way to change it: there's no Share button to find while the list is private
        <button
          type="button"
          onClick={() => setDialog("editList")}
          className="mt-2 flex items-center gap-1.5 text-left text-sm text-muted-foreground hover:text-foreground"
        >
          <LockIcon className="size-3.5 shrink-0" />
          <span>
            Private: only you can see this list.{" "}
            <span className="underline underline-offset-4">Change</span>
          </span>
        </button>
      )}

      {empty ? (
        <div className="flex flex-col items-center py-20 text-center">
          <p className="max-w-xs text-muted-foreground text-pretty">
            Add the first thing you'd like. Paste a link from any shop.
          </p>
          <Button
            size="lg"
            className="mt-6 h-11 px-6"
            onClick={() => setAdding(true)}
          >
            <PlusIcon />
            Add item
          </Button>
        </div>
      ) : (
        <>
          {/* Sharing only appears once there's something worth sharing, and never on a private list */}
          <div
            className={cn(
              "mt-6 grid gap-3 sm:max-w-md",
              !isPrivate && "grid-cols-2",
            )}
          >
            <Button size="lg" className="h-11" onClick={() => setAdding(true)}>
              <PlusIcon />
              Add item
            </Button>
            {!isPrivate && (
              <Button
                variant="outline"
                size="lg"
                className="h-11"
                onClick={() => share(list)}
              >
                <ShareIcon />
                Share
              </Button>
            )}
          </div>

          {/* Who can see the list right now, and a look at it through their eyes */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-muted-foreground sm:max-w-md">
            {!isPrivate && <span>Anyone with the link can see it</span>}
            <Link
              to={`/lists/${listId}/preview`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Preview as guest
            </Link>
          </div>

          {/* Always there for owners: the list is also their own tracker */}
          <div className="mt-8">
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

          <div className="mt-4">
            {shown.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No items match.
              </p>
            ) : view.groupBy === "none" ? (
              renderItems(shown)
            ) : (
              <GroupedItems groups={groups} render={renderItems} />
            )}
          </div>

          {/* Explains why the drag handles disappeared */}
          {!sortable && shown.length > 1 && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              To reorder, use the list layout in My order, with no grouping or
              filters.
            </p>
          )}
        </>
      )}

      <ItemFormSheet
        open={adding}
        onOpenChange={(open) => {
          setAdding(open);
          // Done with the shared link: a refresh or a later "Add item" starts empty
          if (!open && sharedUrl) {
            navigate(location.pathname, { replace: true, state: null });
          }
        }}
        prefillUrl={sharedUrl}
        // A shared link is already filled in, so don't select it for typing over
        autoFocus={sharedUrl === undefined}
        heading="Add item"
        submitLabel="Add"
        existingTags={tags}
        currency={currency}
        submitting={add.isPending}
        onSave={(input) => add.mutate(input)}
      />

      <ItemFormSheet
        open={editing !== undefined && dialog !== "deleteItem"}
        onOpenChange={(open) => !open && setEditing(undefined)}
        heading="Edit item"
        submitLabel="Save"
        autoFocus={false}
        initial={editing && toInput(editing)}
        existingTags={tags}
        currency={currency}
        submitting={update.isPending}
        onSave={(input) =>
          editing && update.mutate({ itemId: editing.itemId, input })
        }
        secondaryAction={
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-11 text-destructive hover:text-destructive sm:mr-auto sm:h-9"
            onClick={() => setDialog("deleteItem")}
          >
            Delete item
          </Button>
        }
      />

      <ListFormSheet
        open={dialog === "editList"}
        onOpenChange={(open) => !open && setDialog(undefined)}
        heading="Edit list"
        submitLabel="Save"
        autoFocus={false}
        initial={{
          title: list.title,
          description: list.description ?? "",
          eventDate: list.eventDate ?? "",
          isPrivate: list.isPrivate ?? false,
        }}
        submitting={editList.isPending}
        onSave={(input) => editList.mutate(input)}
      />

      <ConfirmDialog
        open={dialog === "deleteItem"}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={`Delete ${editing ? itemLabel(editing) : "item"}?`}
        description="It will disappear from your list and from the shared link."
        confirmLabel="Delete"
        onConfirm={() => {
          if (editing) removeItem.mutate(editing.itemId);
          setDialog(undefined);
        }}
      />

      <ConfirmDialog
        open={dialog === "deleteList"}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={`Delete ${list.title}?`}
        description="The list and its items will be deleted, and the shared link will stop working. This can't be undone."
        confirmLabel="Delete list"
        onConfirm={() => removeList.mutate()}
      />

      <ConfirmDialog
        open={dialog === "newLink"}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title="Replace the share link?"
        description="The current link will stop working and a new one takes its place. Use this if the list was shared with someone it shouldn't have been. You'll need to send the new link again."
        confirmLabel="Replace link"
        onConfirm={() => rotateLink.mutate()}
      />
    </PageShell>
  );
}
