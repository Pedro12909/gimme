import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmAction } from "@/components/confirm-action";
import { BackLink, OwnerHeader, PageShell } from "@/components/page-shell";
import { rememberOwnShareTokens } from "@/lib/guest-storage";
import {
  deleteList,
  getList,
  newShareLink,
  updateList,
  type ListWithItems,
} from "@/lib/owner-api";
import { useDocumentTitle } from "@/lib/use-document-title";

// Limits match the owner Lambda's validation
const LIMITS = { title: 100, description: 500 };

function SettingsForm({ list }: { list: ListWithItems }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listPath = `/lists/${list.listId}`;

  const [values, setValues] = useState({
    title: list.title,
    eventDate: list.eventDate ?? "",
    description: list.description ?? "",
    isPrivate: list.isPrivate ?? false,
  });
  type Values = typeof values;
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const [attempted, setAttempted] = useState(false);
  const titleMissing = values.title.trim() === "";

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["list", list.listId] });
    queryClient.invalidateQueries({ queryKey: ["lists"] });
  };

  const save = useMutation({
    mutationFn: () =>
      updateList(list.listId, {
        title: values.title.trim(),
        description: values.description.trim(),
        eventDate: values.eventDate,
        isPrivate: values.isPrivate,
      }),
    onSuccess: () => {
      refresh();
      navigate(listPath);
    },
  });

  const rotateLink = useMutation({
    mutationFn: () => newShareLink(list.listId),
    onSuccess: ({ shareToken }) => {
      rememberOwnShareTokens([shareToken]);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteList(list.listId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["list", list.listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      navigate("/lists", { replace: true });
    },
  });

  return (
    <>
      <form
        noValidate
        className="mt-6 flex max-w-[560px] flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setAttempted(true);
          if (!titleMissing) save.mutate();
        }}
      >
        <label className="label">
          Name
          <input
            type="text"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            maxLength={LIMITS.title}
            autoComplete="off"
            aria-invalid={attempted && titleMissing}
            className="field"
          />
          {attempted && titleMissing && (
            <span className="text-[13px] font-medium text-ink">
              A list needs a name.
            </span>
          )}
        </label>

        {/* Guests see when they need the gift by; lists with dates coming up are listed first */}
        <div className="label">
          <label htmlFor="list-date">Date</label>
          <input
            id="list-date"
            type="date"
            value={values.eventDate}
            onChange={(event) => set("eventDate", event.target.value)}
            className="field"
          />
          {values.eventDate && (
            <button
              type="button"
              className="action min-h-8 self-start text-ink"
              onClick={() => set("eventDate", "")}
            >
              Clear the date
            </button>
          )}
        </div>

        <label className="label">
          Note for guests
          <textarea
            rows={2}
            placeholder="e.g. sizes, or where to send things"
            value={values.description}
            onChange={(event) => set("description", event.target.value)}
            maxLength={LIMITS.description}
            className="field"
          />
        </label>

        <label className="flex items-start gap-3 pt-1 text-[15px] leading-[1.4]">
          <input
            type="checkbox"
            checked={values.isPrivate}
            onChange={(event) => set("isPrivate", event.target.checked)}
            className="mt-px size-5"
          />
          <span>
            Private
            <br />
            <span className="text-[13px] text-muted">
              The share link stops working until you turn this off.
            </span>
          </span>
        </label>

        {save.isError && (
          <p role="alert" className="text-[13px] font-medium">
            Couldn't save. Try again.
          </p>
        )}

        <div className="flex items-center gap-5">
          <button type="submit" className="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
          <Link to={listPath} className="action text-[15px]">
            Cancel
          </Link>
        </div>
      </form>

      <div className="mt-9 flex max-w-[560px] flex-col gap-4 border-t border-hairline pt-5 text-[15px]">
        {!list.isPrivate && (
          <div>
            {rotateLink.isSuccess ? (
              <p className="flex min-h-11 items-center">
                Done. Send the new link to your guests again.
              </p>
            ) : (
              <ConfirmAction
                label="Make a new share link"
                question="Make a new one?"
                confirmLabel="Make it"
                keepLabel="Cancel"
                destructive={false}
                busy={rotateLink.isPending}
                onConfirm={() => rotateLink.mutate()}
              />
            )}
            <p className="text-[13px] text-muted">
              {rotateLink.isError
                ? "Couldn't make a new link. Try again."
                : "The old link stops working. Claims are kept."}
            </p>
          </div>
        )}
        <div>
          <ConfirmAction
            label="Delete this list"
            question="Delete it and everything on it?"
            confirmLabel="Delete"
            busy={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
          {remove.isError && (
            <p role="alert" className="text-[13px] font-medium">
              Couldn't delete the list. Try again.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export default function ListSettings() {
  const { listId = "" } = useParams();
  const { data: list, error } = useQuery({
    queryKey: ["list", listId],
    queryFn: () => getList(listId),
  });
  useDocumentTitle(list && `Settings · ${list.title}`);

  const back = (
    <BackLink to={`/lists/${listId}`}>{list?.title ?? "Back"}</BackLink>
  );

  return (
    <PageShell
      header={
        <>
          <div className="contents sm:hidden">{back}</div>
          <div className="hidden sm:contents">
            <OwnerHeader />
          </div>
        </>
      }
    >
      <div className="hidden text-sm sm:block">{back}</div>
      <h1 className="page-title sm:mt-2">Settings</h1>
      {error && <p className="mt-6 text-muted">Couldn't load this list.</p>}
      {/* Mounted once the list is here, so the fields start with its values */}
      {list && <SettingsForm list={list} />}
    </PageShell>
  );
}
