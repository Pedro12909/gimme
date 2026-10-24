import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { AccountMenu } from "@/components/account-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageShell } from "@/components/page-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { ListFormSheet } from "@/components/owner-forms";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Wordmark } from "@/components/wordmark";
import { ItemThumbnail } from "@/components/item-thumbnail";
import { describeEventDate, isUpcoming } from "@/lib/event-date";
import { rememberOwnShareTokens } from "@/lib/guest-storage";
import {
  createList,
  deleteList,
  getLists,
  updateList,
  type ListInput,
  type ListSummary,
} from "@/lib/owner-api";

// Lists with an occasion coming up go first, soonest first; the rest newest first
function compareLists(a: ListSummary, b: ListSummary) {
  const upcomingA = isUpcoming(a.eventDate);
  const upcomingB = isUpcoming(b.eventDate);
  if (upcomingA && upcomingB) return a.eventDate!.localeCompare(b.eventDate!);
  if (upcomingA !== upcomingB) return upcomingA ? -1 : 1;
  return b.createdAt.localeCompare(a.createdAt);
}

function listDetails(list: ListSummary) {
  const count =
    list.itemCount === undefined
      ? undefined
      : list.itemCount === 0
        ? "No items yet"
        : `${list.itemCount} ${list.itemCount === 1 ? "item" : "items"}`;
  // Past dates aren't worth the space
  const date =
    list.eventDate && isUpcoming(list.eventDate)
      ? describeEventDate(list.eventDate)
      : undefined;
  return [list.isPrivate && "Private", count, date].filter(Boolean).join(" · ");
}

export default function Lists() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  // Tidying up happens here too: a list can be renamed or deleted without opening it
  const [editing, setEditing] = useState<ListSummary>();
  const [deleting, setDeleting] = useState<ListSummary>();

  const {
    data: lists,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ["lists"],
    queryFn: getLists,
  });

  const create = useMutation({
    mutationFn: createList,
    onSuccess: (list) => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      setCreating(false);
      // Straight into the new list, where the next step is adding items
      navigate(`/lists/${list.listId}`);
    },
    onError: () => toast.error("Couldn't create the list. Try again."),
  });

  const edit = useMutation({
    mutationFn: ({ listId, input }: { listId: string; input: ListInput }) =>
      updateList(listId, input),
    onSuccess: (_, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      setEditing(undefined);
    },
    onError: () => toast.error("Couldn't save. Try again."),
  });

  const remove = useMutation({
    mutationFn: deleteList,
    onSuccess: (_, listId) => {
      queryClient.removeQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      toast("List deleted");
    },
    onError: () => toast.error("Couldn't delete the list. Try again."),
  });

  // Lets the guest page recognise this owner's own links on this device
  useEffect(() => {
    if (lists)
      rememberOwnShareTokens(
        lists.map((list) => list.shareToken),
        true,
      );
  }, [lists]);

  const sorted = [...(lists ?? [])].sort(compareLists);

  return (
    <PageShell
      header={
        <>
          <Wordmark />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <AccountMenu />
          </div>
        </>
      }
    >
      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="mt-8 h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : error ? (
        <div className="py-24 text-center">
          <p className="text-muted-foreground">Couldn't load your lists.</p>
          <Button
            variant="outline"
            size="lg"
            className="mt-6"
            onClick={() => refetch()}
          >
            Try again
          </Button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Start your first list
          </h1>
          <p className="mt-2 max-w-xs text-muted-foreground text-pretty">
            Add things you'd love, then share one link with the people who ask.
          </p>
          <Button
            size="lg"
            className="mt-8 h-11 px-6"
            onClick={() => setCreating(true)}
          >
            <PlusIcon />
            New list
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">
              Your lists
            </h1>
            <Button size="lg" onClick={() => setCreating(true)}>
              <PlusIcon />
              New list
            </Button>
          </div>

          <ul className="mt-6 divide-y border-y">
            {sorted.map((list) => (
              <li key={list.listId} className="flex items-center gap-1">
                <Link
                  to={`/lists/${list.listId}`}
                  className="-ml-2 flex min-w-0 flex-1 items-center gap-4 rounded-md px-2 py-4 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{list.title}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {listDetails(list)}
                    </p>
                  </div>
                  {/* A few photos make lists recognisable without reading */}
                  {list.previewImages && list.previewImages.length > 0 && (
                    <div
                      className="flex shrink-0 -space-x-2"
                      aria-hidden="true"
                    >
                      {list.previewImages.map((src, index) => (
                        <ItemThumbnail
                          key={index}
                          src={src}
                          className="size-9 ring-2 ring-background"
                        />
                      ))}
                    </div>
                  )}
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      className="-mr-2 shrink-0"
                      aria-label={`Options for ${list.title}`}
                    >
                      <MoreHorizontalIcon className="size-5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-40">
                    <DropdownMenuItem onSelect={() => setEditing(list)}>
                      Edit list
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setDeleting(list)}
                    >
                      Delete list
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        </>
      )}

      <ListFormSheet
        open={creating}
        onOpenChange={setCreating}
        heading="New list"
        submitLabel="Create list"
        submitting={create.isPending}
        onSave={(input) => create.mutate(input)}
      />

      <ListFormSheet
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        heading="Edit list"
        submitLabel="Save"
        autoFocus={false}
        initial={
          editing && {
            title: editing.title,
            description: editing.description ?? "",
            eventDate: editing.eventDate ?? "",
            isPrivate: editing.isPrivate ?? false,
          }
        }
        submitting={edit.isPending}
        onSave={(input) =>
          editing && edit.mutate({ listId: editing.listId, input })
        }
      />

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete ${deleting?.title ?? "list"}?`}
        description="The list and its items will be deleted, and the shared link will stop working. This can't be undone."
        confirmLabel="Delete list"
        onConfirm={() => deleting && remove.mutate(deleting.listId)}
      />
    </PageShell>
  );
}
