import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { listPath, useLists } from "@/lib/owner-data";
import { cn } from "@/lib/utils";

// Where the installed app receives "Share → gimme" from a shop's app (see the web manifest).
// Shops put the link in different fields, often inside text like "Kindle Paperwhite https://amzn.eu/d/abc".
function sharedLink(params: URLSearchParams) {
  const fields = [params.get("url"), params.get("text"), params.get("title")];
  for (const field of fields) {
    const match = field?.match(/https?:\/\/\S+/);
    if (match) return match[0];
  }
  return undefined;
}

// The words shared with the link, from whichever field has more of them: a shop app's text, or
// the page title a browser sends. They name the item when the shop's page can't be read.
function sharedWords(params: URLSearchParams) {
  return [params.get("title"), params.get("text")]
    .map((field) =>
      (field ?? "")
        .replace(/\S*https?:\/\/\S+/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .reduce((longest, words) =>
      words.length > longest.length ? words : longest,
    );
}

export default function ShareTarget() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const link = sharedLink(params);
  // Added on the list the same way as a pasted message: the link, plus words to name it
  const addText = link && `${sharedWords(params)} ${link}`.trim();

  const { data, error } = useLists();
  const lists = data?.lists ?? [];
  // The default list is picked already; with only one list there's nothing to choose
  const [chosen, setChosen] = useState<string>();
  const listId = chosen ?? data?.defaultListId;
  const onlyList = lists.length === 1 ? lists[0] : undefined;

  const go = (id: string) => {
    const list = lists.find((other) => other.listId === id);
    navigate(listPath(id, list?.isDefault), {
      replace: true,
      state: { addText },
    });
  };

  useEffect(() => {
    if (addText && onlyList) go(onlyList.listId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once the lists are known
  }, [addText, onlyList]);

  return (
    <AppShell current={undefined}>
      {!link ? (
        <p className="text-[15px]">
          There was no link in what was shared.{" "}
          <Link to="/" className="action">
            Go to your list
          </Link>
        </p>
      ) : error ? (
        <p className="text-[15px] text-muted">Couldn't load your lists.</p>
      ) : (
        data &&
        !onlyList && (
          <form
            className="flex max-w-[560px] flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (listId) go(listId);
            }}
          >
            <div>
              <h1 className="page-title">Add to which list?</h1>
              <p className="mt-2 truncate text-sm text-muted">{link}</p>
            </div>
            <fieldset className="flex flex-col">
              <legend className="sr-only">List</legend>
              {lists.map((list) => (
                <label
                  key={list.listId}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-sm px-3 text-[15px] hover:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink",
                    listId === list.listId && "bg-selected font-semibold",
                  )}
                >
                  <input
                    type="radio"
                    name="list"
                    className="sr-only"
                    checked={listId === list.listId}
                    onChange={() => setChosen(list.listId)}
                  />
                  <span className="min-w-0 truncate">{list.title}</span>
                  {list.isDefault && (
                    <span
                      role="img"
                      aria-label="Default list"
                      className="text-muted"
                    >
                      <Icon name="home" size={15} />
                    </span>
                  )}
                  {listId === list.listId && (
                    <Icon name="check" size={16} className="ml-auto" />
                  )}
                </label>
              ))}
            </fieldset>
            <button type="submit" className="submit self-start">
              Add it
            </button>
          </form>
        )
      )}
    </AppShell>
  );
}
