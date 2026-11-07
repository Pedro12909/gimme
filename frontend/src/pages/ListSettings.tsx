import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { FieldBones, Loading } from "@/components/skeleton";
import { ApiError } from "@/lib/http";
import { updateList, type ListWithItems } from "@/lib/owner-api";
import { listKey, listPath, listsKey, useList } from "@/lib/owner-data";
import { useDocumentTitle } from "@/lib/use-document-title";

// The list's details that don't fit its menu: the date and the note guests read.
// Rename, privacy, share links and delete live in the list's options menu.

// Limits match the owner Lambda's validation
const LIMITS = { title: 100, description: 500 };

function DetailsForm({ list }: { list: ListWithItems }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const back = listPath(list.listId, list.isDefault);

  const [values, setValues] = useState({
    title: list.title,
    eventDate: list.eventDate ?? "",
    description: list.description ?? "",
  });
  type Values = typeof values;
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const [attempted, setAttempted] = useState(false);
  const titleMissing = values.title.trim() === "";

  const save = useMutation({
    mutationFn: () =>
      updateList(list.listId, {
        title: values.title.trim(),
        description: values.description.trim(),
        eventDate: values.eventDate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey(list.listId) });
      queryClient.invalidateQueries({ queryKey: listsKey });
      navigate(back);
    },
  });

  return (
    <form
      noValidate
      className="flex max-w-[560px] flex-col gap-4"
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
          <span className="text-[13px] text-danger">A list needs a name.</span>
        )}
      </label>

      {/* Guests see when they need the gift by */}
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
            className="action min-h-8 self-start"
            onClick={() => set("eventDate", "")}
          >
            Clear the date
          </button>
        )}
      </div>

      <label className="label">
        Note for guests
        <textarea
          rows={3}
          placeholder="e.g. sizes, or where to send things"
          value={values.description}
          onChange={(event) => set("description", event.target.value)}
          maxLength={LIMITS.description}
          className="field"
        />
      </label>

      {save.isError && (
        <p role="alert" className="text-[13px] text-danger">
          Couldn't save. Try again.
        </p>
      )}

      <div className="flex items-center gap-5">
        <button type="submit" className="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
        <Link to={back} className="action text-[15px]">
          Cancel
        </Link>
      </div>
    </form>
  );
}

export default function ListSettings() {
  const { listId = "" } = useParams();
  const { data: list, error } = useList(listId);
  useDocumentTitle(list && `Date and note · ${list.title}`);

  if (error instanceof ApiError && error.status === 404) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppShell current={{ kind: "list", listId }}>
      <div>
        {list && (
          <Link
            to={listPath(list.listId, list.isDefault)}
            className="text-sm text-muted hover:text-ink hover:underline hover:underline-offset-3"
          >
            ← {list.title}
          </Link>
        )}
        <h1 className="page-title mt-1">Date and note for guests</h1>
      </div>
      {error && <p className="text-muted">Couldn't load this list.</p>}
      {/* Mounted once the list is here, so the fields start with its values */}
      {list && <DetailsForm list={list} />}
      {!list && !error && (
        <Loading label="Loading" className="flex flex-col gap-4">
          <FieldBones />
          <FieldBones />
          <FieldBones />
        </Loading>
      )}
    </AppShell>
  );
}
