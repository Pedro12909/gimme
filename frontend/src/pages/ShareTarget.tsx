import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Wordmark } from "@/components/wordmark";
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

export default function ShareTarget() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const link = sharedLink(params);

  const {
    data: lists,
    isPending,
    error,
  } = useQuery({
    queryKey: ["lists"],
    queryFn: getLists,
  });

  // With a single list there's nothing to choose: go straight to adding
  const onlyList = lists?.length === 1 ? lists[0] : undefined;
  useEffect(() => {
    if (link && onlyList) {
      navigate(`/lists/${onlyList.listId}`, {
        replace: true,
        state: { addUrl: link },
      });
    }
  }, [link, onlyList, navigate]);

  const header = (
    <>
      <Wordmark />
      <ThemeToggle />
    </>
  );

  const message = (text: string) => (
    <div className="py-24 text-center">
      <p className="text-muted-foreground text-pretty">{text}</p>
      <Button asChild variant="outline" size="lg" className="mt-6">
        <Link to="/lists">Go to your lists</Link>
      </Button>
    </div>
  );

  if (!link) {
    return (
      <PageShell header={header}>
        {message("There was no link in what was shared.")}
      </PageShell>
    );
  }
  if (isPending || onlyList) {
    return (
      <PageShell header={header}>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="mt-8 h-14 w-full" />
      </PageShell>
    );
  }
  if (error) {
    return (
      <PageShell header={header}>
        {message("Couldn't load your lists.")}
      </PageShell>
    );
  }
  if (lists.length === 0) {
    return (
      <PageShell header={header}>
        {message("Create a list first, then share things into it.")}
      </PageShell>
    );
  }

  return (
    <PageShell header={header}>
      <h1 className="text-2xl font-semibold tracking-tight">
        Add to which list?
      </h1>
      <p className="mt-2 truncate text-sm text-muted-foreground">{link}</p>

      <ul className="mt-6 divide-y border-y">
        {lists.map((list) => (
          <li key={list.listId}>
            <Link
              to={`/lists/${list.listId}`}
              state={{ addUrl: link }}
              replace
              className="-mx-2 flex items-center gap-4 rounded-md px-2 py-4 hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {list.title}
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
