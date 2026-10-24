import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, EyeIcon } from "lucide-react";
import { ClaimSheet } from "@/components/claim-sheet";
import { GuestListView, type GuestActions } from "@/components/guest-list-view";
import { PageShell } from "@/components/page-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { SharedItem } from "@/lib/guest-api";
import { getList } from "@/lib/owner-api";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useListView } from "@/lib/use-list-view";

// The guest page, built from the owner's own data. The owner API never returns claims,
// so this can't spoil anything: every item simply shows as available.
export default function ListPreview() {
  const { listId = "" } = useParams();
  const [view, setView] = useListView(`preview:${listId}`);
  // Claim opens the same steps guests go through, without claiming anything
  const [claiming, setClaiming] = useState<SharedItem>();
  const previewActions: GuestActions = {
    onClaim: setClaiming,
    onUnclaim: () => {},
    isMine: () => false,
  };
  // Same cache as the list page, so opening the preview from there is instant
  const {
    data: list,
    isPending,
    error,
  } = useQuery({
    queryKey: ["list", listId],
    queryFn: () => getList(listId),
  });
  useDocumentTitle(list?.title);

  const header = (
    <>
      <Button asChild variant="ghost" size="lg" className="-ml-3">
        <Link to={`/lists/${listId}`}>
          <ChevronLeftIcon />
          Back to list
        </Link>
      </Button>
      <ThemeToggle />
    </>
  );

  if (isPending || error) {
    return (
      <PageShell header={header}>
        {isPending ? (
          <Skeleton className="h-8 w-2/3" />
        ) : (
          <p className="py-24 text-center text-muted-foreground">
            Couldn't load this list.
          </p>
        )}
      </PageShell>
    );
  }

  const items: SharedItem[] = list.items.map((item) => ({
    ...item,
    claimed: false,
  }));

  return (
    <PageShell header={header} wide={view.layout === "grid"}>
      <GuestListView
        list={list}
        items={items}
        actions={previewActions}
        view={view}
        onViewChange={setView}
        notice={
          <div className="flex items-start gap-3 rounded-lg border p-4 text-sm text-pretty">
            <EyeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p>
              This is what guests see. Claims never show up for you, so
              everything looks available here.
            </p>
          </div>
        }
      />

      <ClaimSheet item={claiming} onClose={() => setClaiming(undefined)} />
    </PageShell>
  );
}
