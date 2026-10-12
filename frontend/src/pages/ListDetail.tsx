import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PlusIcon,
  ShareIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ItemThumbnail } from "@/components/item-thumbnail";
import { ThemeToggle } from "@/components/theme-toggle";
import { ItemFormSheet, ListFormSheet } from "@/components/owner-forms";
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
import { safeHref, siteName } from "@/lib/links";
import {
  addItem,
  deleteItem,
  deleteList,
  getList,
  newShareLink,
  shareUrl,
  updateItem,
  updateList,
  type Item,
  type ListWithItems,
} from "@/lib/owner-api";

type Dialog = "editList" | "deleteList" | "newLink" | "deleteItem" | undefined;

const itemLabel = (item: Item) => item.title?.trim() || siteName(item.url);

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

export default function ListDetail() {
  const { listId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item>();
  const [dialog, setDialog] = useState<Dialog>();

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
    mutationFn: (input: Parameters<typeof addItem>[1]) =>
      addItem(listId, input),
    onSuccess: () => {
      setAdding(false);
      refresh();
    },
    onError: saveFailed,
  });

  const update = useMutation({
    mutationFn: ({
      itemId,
      input,
    }: {
      itemId: string;
      input: Parameters<typeof updateItem>[2];
    }) => updateItem(listId, itemId, input),
    onSuccess: () => {
      setEditing(undefined);
      refresh();
    },
    onError: saveFailed,
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

  const backLink = (
    <Button asChild variant="ghost" size="lg" className="-ml-3">
      <Link to="/lists">
        <ChevronLeftIcon />
        Lists
      </Link>
    </Button>
  );

  if (isPending) {
    return (
      <>
        <header className="flex h-12 items-center">{backLink}</header>
        <Skeleton className="mt-8 h-8 w-2/3" />
        <Skeleton className="mt-8 h-11 w-full" />
        <div className="mt-8 space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;

    return (
      <>
        <header className="flex h-12 items-center">{backLink}</header>
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
      </>
    );
  }

  const empty = list.items.length === 0;

  return (
    <>
      <header className="flex h-12 items-center justify-between">
        {backLink}
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-lg" aria-label="List options">
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
      </header>

      <main className="pt-6">
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
              <Button
                size="lg"
                className="h-11"
                onClick={() => setAdding(true)}
              >
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

            <ul className="mt-6 divide-y border-y">
              {list.items.map((item) => (
                <ItemRow
                  key={item.itemId}
                  item={item}
                  onEdit={() => setEditing(item)}
                />
              ))}
            </ul>
          </>
        )}
      </main>

      <ItemFormSheet
        open={adding}
        onOpenChange={setAdding}
        heading="Add item"
        submitLabel="Add"
        submitting={add.isPending}
        onSave={(input) => add.mutate(input)}
      />

      <ItemFormSheet
        open={editing !== undefined && dialog !== "deleteItem"}
        onOpenChange={(open) => !open && setEditing(undefined)}
        heading="Edit item"
        submitLabel="Save"
        initial={
          editing && {
            url: editing.url,
            title: editing.title ?? "",
            note: editing.note ?? "",
            imageUrl: editing.imageUrl ?? "",
            price: editing.price ?? "",
          }
        }
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
    </>
  );
}

function ItemRow({ item, onEdit }: { item: Item; onEdit: () => void }) {
  const href = safeHref(item.url);
  const details = [
    item.price,
    item.title?.trim() ? siteName(item.url) : undefined,
    item.note,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-center gap-2">
      {/* Tapping the row edits it; the link icon is for checking the product page */}
      <button
        type="button"
        onClick={onEdit}
        className="-ml-2 flex min-w-0 flex-1 items-center gap-3 rounded-md py-3 pl-2 text-left hover:bg-muted/50"
      >
        <ItemThumbnail src={item.imageUrl} />
        <div className="min-w-0">
          {/* Shop names can be long, so allow two lines before truncating */}
          <p className="line-clamp-2 font-medium">{itemLabel(item)}</p>
          {details && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {details}
            </p>
          )}
        </div>
      </button>
      {href && (
        <Button
          asChild
          variant="ghost"
          size="icon-lg"
          aria-label={`Open ${itemLabel(item)}`}
        >
          <a href={href} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon className="text-muted-foreground" />
          </a>
        </Button>
      )}
    </li>
  );
}
