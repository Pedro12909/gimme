import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { OwnerHeader, PageShell } from "@/components/page-shell";
import { getLists } from "@/lib/owner-api";

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
  // Added on the list page the same way as a pasted message: the link, plus words to name it
  const addText = link && `${sharedWords(params)} ${link}`.trim();

  const { data: lists, error } = useQuery({
    queryKey: ["lists"],
    queryFn: getLists,
  });

  // With a single list there's nothing to choose: go straight to adding
  const onlyList = lists?.length === 1 ? lists[0] : undefined;
  useEffect(() => {
    if (addText && onlyList) {
      navigate(`/lists/${onlyList.listId}`, {
        replace: true,
        state: { addText },
      });
    }
  }, [addText, onlyList, navigate]);

  const message = (text: string) => (
    <p className="max-w-[560px] text-[15px]">
      {text}{" "}
      <Link to="/lists" className="action">
        Go to your lists
      </Link>
    </p>
  );

  return (
    <PageShell header={<OwnerHeader />}>
      {!link
        ? message("There was no link in what was shared.")
        : error
          ? message("Couldn't load your lists.")
          : lists?.length === 0
            ? message("Make a list first, then share things into it.")
            : lists &&
              !onlyList && (
                <>
                  <h1 className="page-title">Add to which list?</h1>
                  <p className="mt-2.5 truncate text-sm text-muted">{link}</p>
                  <ul className="mt-8 flex flex-col gap-2">
                    {lists.map((list) => (
                      <li key={list.listId}>
                        <Link
                          to={`/lists/${list.listId}`}
                          state={{ addText }}
                          replace
                          className="flex min-h-12 items-center text-[28px] leading-none font-bold uppercase [font-stretch:80%] [overflow-wrap:anywhere] underline-offset-4 hover:underline"
                        >
                          {list.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
    </PageShell>
  );
}
