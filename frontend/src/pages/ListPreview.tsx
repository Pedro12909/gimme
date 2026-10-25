import { useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ClaimSheet } from "@/components/claim-sheet";
import {
  GuestListView,
  WhoseList,
  type GuestActions,
} from "@/components/guest-list-view";
import { BackLink, PageShell } from "@/components/page-shell";
import type { SharedItem } from "@/lib/guest-api";
import { getList, getMe } from "@/lib/owner-api";
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
  const { data: list, error } = useQuery({
    queryKey: ["list", listId],
    queryFn: () => getList(listId),
  });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  useDocumentTitle(list?.title);

  const header = (
    <>
      <BackLink to={`/lists/${listId}`}>Back to your list</BackLink>
      <WhoseList ownerName={me?.displayName} />
    </>
  );

  if (!list) {
    return (
      <PageShell header={header}>
        {error && <p className="text-muted">Couldn't load this list.</p>}
      </PageShell>
    );
  }

  const items: SharedItem[] = list.items.map((item) => ({
    ...item,
    claimed: false,
  }));

  return (
    <PageShell header={header}>
      <GuestListView
        list={{ ...list, ownerName: me?.displayName }}
        items={items}
        actions={previewActions}
        view={view}
        onViewChange={setView}
        notice={
          <p className="text-sm text-muted">
            This is what guests see. Claims never show up for you, so everything
            looks available here.
          </p>
        }
      />

      <ClaimSheet
        item={claiming}
        ownerName={me?.displayName}
        onClose={() => setClaiming(undefined)}
      />
    </PageShell>
  );
}
