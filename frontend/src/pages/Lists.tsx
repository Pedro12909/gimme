import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OwnerHeader, PageShell } from "@/components/page-shell";
import { TileSquare } from "@/components/tile";
import { formatEventDate, isUpcoming } from "@/lib/event-date";
import { rememberOwnShareTokens } from "@/lib/guest-storage";
import { countThings } from "@/lib/item-view";
import { createList, getLists, getMe, type ListSummary } from "@/lib/owner-api";

// Lists with an occasion coming up go first, soonest first; the rest newest first
function compareLists(a: ListSummary, b: ListSummary) {
  const upcomingA = isUpcoming(a.eventDate);
  const upcomingB = isUpcoming(b.eventDate);
  if (upcomingA && upcomingB) return a.eventDate!.localeCompare(b.eventDate!);
  if (upcomingA !== upcomingB) return upcomingA ? -1 : 1;
  return b.createdAt.localeCompare(a.createdAt);
}

// "25 December · 6 things · shared"
function listMeta(list: ListSummary) {
  return [
    list.eventDate ? formatEventDate(list.eventDate) : "No date",
    list.itemCount !== undefined && countThings(list.itemCount),
    list.isPrivate ? "private" : "shared",
  ]
    .filter(Boolean)
    .join(" · ");
}

const PREVIEW_TILES = 3;

export default function Lists() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");

  const {
    data: lists,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ["lists"],
    queryFn: getLists,
  });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const create = useMutation({
    mutationFn: () =>
      createList({
        title: title.trim(),
        description: "",
        eventDate: "",
        isPrivate: false,
      }),
    onSuccess: (list) => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      // Straight into the new list, where the next step is adding things
      navigate(`/lists/${list.listId}`);
    },
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
    <PageShell header={<OwnerHeader />}>
      <h1 className="page-title">Your lists</h1>

      <form
        noValidate
        className="mt-6 max-w-[640px] sm:mt-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim()) create.mutate();
        }}
      >
        <div className="flex">
          <label htmlFor="new-list" className="sr-only">
            Name a new list
          </label>
          <input
            id="new-list"
            type="text"
            placeholder="Name a new list, e.g. Birthday"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            autoComplete="off"
            enterKeyHint="go"
            className="field min-h-[52px] min-w-0 flex-1 border-r-0 px-4"
          />
          <button
            type="submit"
            className="submit min-h-[52px] px-5"
            disabled={create.isPending}
          >
            Create
          </button>
        </div>
        {create.isError && (
          <p role="alert" className="mt-2 text-[13px] font-medium">
            Couldn't create the list. Try again.
          </p>
        )}
        {/* Guests see lists as "Pedro's list" once the owner has a name */}
        {me && !me.displayName && (
          <p className="mt-2.5 text-[13px] text-muted">
            Guests will see whose list it is once you add your name in{" "}
            <Link
              to="/account"
              className="text-ink underline underline-offset-3"
            >
              Account
            </Link>
            .
          </p>
        )}
      </form>

      {error ? (
        <p className="mt-12 text-muted">
          Couldn't load your lists.{" "}
          <button
            type="button"
            className="action text-ink"
            onClick={() => refetch()}
          >
            Try again
          </button>
        </p>
      ) : (
        !isPending && (
          <ul className="mt-10 flex flex-col gap-10 sm:mt-12">
            {sorted.map((list) => {
              const images = list.previewImages ?? [];
              return (
                <li key={list.listId}>
                  <Link
                    to={`/lists/${list.listId}`}
                    className="group flex flex-wrap items-end gap-x-7 gap-y-3"
                  >
                    {/* A few photos make lists recognisable without reading */}
                    <span
                      aria-hidden="true"
                      className="grid w-full grid-cols-3 gap-0.5 sm:w-[400px]"
                    >
                      {Array.from({ length: PREVIEW_TILES }, (_, index) => (
                        <TileSquare key={index} imageUrl={images[index]} />
                      ))}
                    </span>
                    <span className="flex flex-col gap-1.5 pb-1">
                      <span className="text-[28px] leading-none font-bold uppercase [font-stretch:80%] [overflow-wrap:anywhere] underline-offset-4 group-hover:underline">
                        {list.title}
                      </span>
                      <span className="text-sm text-muted">
                        {listMeta(list)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      )}
    </PageShell>
  );
}
