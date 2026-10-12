import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  MoreHorizontalIcon,
  PlusIcon,
  ShareIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  ListControls,
  MIN_ITEMS_FOR_CONTROLS,
} from "@/components/list-controls";
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
import { ApiError } from "@/lib/http";
import { sortByPosition } from "@/lib/item-order";
import {
  applyView,
  collectTags,
  DEFAULT_VIEW,
  isFiltered,
  itemLabel,
  type ListView,
} from "@/lib/item-view";
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
});

export default function ListDetail() {
  const { listId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item>();
  const [dialog, setDialog] = useState<Dialog>();
  const [view, setView] = useState<ListView>(DEFAULT_VIEW);

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
      toast("New link created. The old one no longer works.");
    },
    onError: () => toast.error("Couldn't create a new link. Try again."),
  });

  const items = useMemo(() => list?.items ?? [], [list]);
  const tags = useMemo(() => collectTags(items), [items]);
  const shown = useMemo(() => applyView(items, view), [items, view]);

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
  const showControls = items.length >= MIN_ITEMS_FOR_CONTROLS;
  // Dragging only makes sense in the owner's own order, with nothing hidden
  const sortable = view.sort === "ranking" && !isFiltered(view);

  return (
    <PageShell
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
                {!empty && (
                  <DropdownMenuItem onSelect={() => setDialog("newLink")}>
                    Create new share link
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
      {list.description && (
        <p className="mt-2 text-muted-foreground text-pretty">
          {list.description}
        </p>
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
          {/* Sharing only appears once there's something worth sharing */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button size="lg" className="h-11" onClick={() => setAdding(true)}>
              <PlusIcon />
              Add item
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-11"
              onClick={() => share(list)}
            >
              <ShareIcon />
              Share
            </Button>
          </div>

          {showControls && (
            <div className="mt-8">
              <ListControls
                view={view}
                onChange={setView}
                tags={tags}
                rankingLabel="My order"
                shownCount={shown.length}
                totalCount={items.length}
              />
            </div>
          )}

          <div className="mt-4">
            {shown.length > 0 ? (
              <OwnerItemList
                items={shown}
                sortable={sortable}
                onEdit={setEditing}
                onMove={(itemId, position) => move.mutate({ itemId, position })}
              />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No items match.
              </p>
            )}
          </div>

          {/* Explains why the drag handles disappeared */}
          {!sortable && shown.length > 1 && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              To reorder, sort by My order and clear filters.
            </p>
          )}
        </>
      )}

      <ItemFormSheet
        open={adding}
        onOpenChange={setAdding}
        heading="Add item"
        submitLabel="Add"
        existingTags={tags}
        submitting={add.isPending}
        onSave={(input) => add.mutate(input)}
      />

      <ItemFormSheet
        open={editing !== undefined && dialog !== "deleteItem"}
        onOpenChange={(open) => !open && setEditing(undefined)}
        heading="Edit item"
        submitLabel="Save"
        initial={editing && toInput(editing)}
        existingTags={tags}
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
        initial={{ title: list.title, description: list.description ?? "" }}
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
        title="Create a new share link?"
        description="The current link will stop working. Use this if the list was shared with someone it shouldn't have been. You'll need to send the new link again."
        confirmLabel="Create new link"
        onConfirm={() => rotateLink.mutate()}
      />
    </PageShell>
  );
}
