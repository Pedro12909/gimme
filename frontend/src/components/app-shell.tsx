import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon, IconButton, type IconName } from "@/components/icon";
import { Menu, MenuItem } from "@/components/menu";
import { Modal } from "@/components/modal";
import { Bone } from "@/components/skeleton";
import { MAX_LISTS_PER_OWNER } from "@/lib/limits";
import { createList, getMe, type ItemsView } from "@/lib/owner-api";
import {
  listPath,
  listsKey,
  useLists,
  VIEW_PATHS,
  VIEW_TITLES,
  type Selection,
} from "@/lib/owner-data";
import { useAuth } from "@/lib/use-auth";
import { useSignOut } from "@/lib/use-sign-out";
import { cn } from "@/lib/utils";

// Every signed-in screen: the sidebar (views, lists, account) beside the main column on
// desktop; a header and a row of list chips above it on phones (design/home-redesign.md, 6).

// What's highlighted in the navigation; "account" is the settings screen
export type Current = Selection | { kind: "account" } | undefined;

const VIEW_ICONS: Record<ItemsView, IconName> = {
  all: "grid",
  want: "star",
  got: "check-circle",
};

const isCurrentList = (current: Current, listId: string) =>
  current?.kind === "list" && current.listId === listId;
const isCurrentView = (current: Current, view: ItemsView) =>
  current?.kind === "view" && current.view === view;

// The new list opens with its name ready to type over
function useNewList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useLists();
  const full = (data?.lists.length ?? 0) >= MAX_LISTS_PER_OWNER;

  const create = useMutation({
    mutationFn: () =>
      createList({
        title: "Untitled list",
        description: "",
        eventDate: "",
        isPrivate: false,
      }),
    onSuccess: (list) => {
      queryClient.invalidateQueries({ queryKey: listsKey });
      navigate(listPath(list.listId), { state: { rename: true } });
    },
  });

  return {
    full,
    label: full
      ? `You have ${MAX_LISTS_PER_OWNER} lists, the most you can have`
      : "New list",
    create: () => !full && !create.isPending && create.mutate(),
    pending: create.isPending,
    failed: create.isError,
  };
}

function useOwnerName() {
  const { user } = useAuth();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const email = user?.signInDetails?.loginId;
  const name = me?.displayName || email || "You";
  return { name, initial: name.trim().charAt(0).toUpperCase() || "?" };
}

function Avatar({ initial, size }: { initial: string; size: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex flex-none items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-on"
    >
      {initial}
    </span>
  );
}

function Count({ value }: { value: number | undefined }) {
  return (
    <span className="ml-auto text-[13px] font-normal text-muted tabular-nums">
      {value}
    </span>
  );
}

function Sidebar({ current }: { current: Current }) {
  const { data, isPending } = useLists();
  const newList = useNewList();
  const { name, initial } = useOwnerName();
  const signOut = useSignOut();
  const navigate = useNavigate();

  const lists = data?.lists ?? [];
  const totals: Record<ItemsView, number | undefined> = {
    all: data && lists.reduce((sum, list) => sum + list.itemCount, 0),
    want: data && lists.reduce((sum, list) => sum + list.starredCount, 0),
    got: data && lists.reduce((sum, list) => sum + list.gotCount, 0),
  };

  return (
    <nav
      aria-label="Lists and account"
      className="in-sidebar sticky top-0 flex h-dvh w-(--sidebar-width) flex-none flex-col gap-[22px] overflow-y-auto bg-surface px-2.5 pt-5 pb-3"
    >
      <Link to="/" className="wordmark flex min-h-10 items-center px-3">
        gimme
      </Link>

      <ul className="flex flex-col">
        {(Object.keys(VIEW_PATHS) as ItemsView[]).map((view) => (
          <li key={view}>
            <Link
              to={VIEW_PATHS[view]}
              aria-current={isCurrentView(current, view) ? "page" : undefined}
              className="nav-row"
            >
              <Icon name={VIEW_ICONS[view]} size={18} className="text-ink-2" />
              {VIEW_TITLES[view]}
              <Count value={totals[view]} />
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex min-h-0 flex-col gap-1">
        <div className="flex items-center justify-between pr-1 pl-3">
          <h2 className="text-[13px] font-semibold text-muted">Lists</h2>
          <IconButton
            icon="plus"
            small
            label={newList.label}
            disabled={newList.full || newList.pending}
            onClick={newList.create}
          />
        </div>
        {newList.failed && (
          <p role="alert" className="px-3 text-[13px] text-danger">
            Couldn't make a list. Try again.
          </p>
        )}
        {isPending ? (
          <div className="flex flex-col gap-3 px-3 pt-2">
            <Bone className="h-4 w-32" />
            <Bone className="h-4 w-24" />
          </div>
        ) : (
          <ul className="flex flex-col">
            {lists.map((list) => (
              <li key={list.listId}>
                <Link
                  to={listPath(list.listId, list.isDefault)}
                  aria-current={
                    isCurrentList(current, list.listId) ? "page" : undefined
                  }
                  title={list.isDefault ? "Opens first" : undefined}
                  className="nav-row"
                >
                  <span className="min-w-0 truncate">{list.title}</span>
                  {list.isDefault && (
                    <span
                      role="img"
                      aria-label="Default list"
                      className="flex flex-none text-muted"
                    >
                      <Icon name="home" size={15} />
                    </span>
                  )}
                  <Count value={list.itemCount} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto">
        <Menu
          side="top"
          align="start"
          label="Account"
          className="w-full"
          trigger={(props) => (
            <button
              type="button"
              {...props}
              aria-current={current?.kind === "account" ? "page" : undefined}
              className="nav-row w-full aria-expanded:bg-surface-2"
            >
              <Avatar initial={initial} size={28} />
              <span className="min-w-0 truncate font-medium">{name}</span>
              <Icon name="more" size={18} className="ml-auto text-ink-2" />
            </button>
          )}
        >
          <MenuItem onSelect={() => navigate("/account")}>Settings</MenuItem>
          <MenuItem onSelect={signOut}>Sign out</MenuItem>
        </Menu>
      </div>
    </nav>
  );
}

const chip =
  "flex h-9 flex-none items-center gap-1.5 rounded-full px-3.5 text-sm whitespace-nowrap";

function PhoneNav({ current }: { current: Current }) {
  const { data } = useLists();
  const newList = useNewList();
  const { name, initial } = useOwnerName();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetHeading = useId();

  const go = (path: string) => {
    setSheetOpen(false);
    navigate(path);
  };
  const chipState = (active: boolean) =>
    active ? "bg-accent font-semibold text-accent-on" : "bg-surface text-ink";

  return (
    <>
      <header className="flex min-h-14 items-center justify-between px-5 pt-[env(safe-area-inset-top)] sm:px-8">
        <Link to="/" className="wordmark flex min-h-11 items-center">
          gimme
        </Link>
        <button
          type="button"
          aria-label={`Account: ${name}`}
          title="Account"
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
          className="flex size-11 items-center justify-center"
        >
          <Avatar initial={initial} size={30} />
        </button>
      </header>

      <nav aria-label="Lists">
        <ul className="flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:px-8">
          <li>
            <Link
              to={VIEW_PATHS.want}
              aria-label={VIEW_TITLES.want}
              title={VIEW_TITLES.want}
              aria-current={isCurrentView(current, "want") ? "page" : undefined}
              className={cn(chip, chipState(isCurrentView(current, "want")))}
            >
              <Icon name="star" size={16} />
            </Link>
          </li>
          {data?.lists.map((list) => {
            const active = isCurrentList(current, list.listId);
            return (
              <li key={list.listId}>
                <Link
                  to={listPath(list.listId, list.isDefault)}
                  aria-current={active ? "page" : undefined}
                  className={cn(chip, chipState(active))}
                >
                  {list.title}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-label={newList.label}
              title={newList.label}
              disabled={newList.full || newList.pending}
              onClick={newList.create}
              className={cn(
                chip,
                "border border-dashed border-hairline-strong text-ink-2 disabled:opacity-40",
              )}
            >
              <Icon name="plus" size={16} />
            </button>
          </li>
        </ul>
      </nav>

      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        labelledBy={sheetHeading}
        className="inset-x-0 top-auto bottom-0 w-full max-w-none rounded-t-lg bg-ground shadow-sheet"
      >
        <div className="px-3 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3 px-3 pb-2">
            <Avatar initial={initial} size={30} />
            <h2
              id={sheetHeading}
              className="min-w-0 flex-1 truncate font-semibold"
            >
              {name}
            </h2>
            <IconButton
              icon="close"
              label="Close"
              onClick={() => setSheetOpen(false)}
            />
          </div>
          {[
            { label: VIEW_TITLES.all, path: VIEW_PATHS.all, icon: "grid" },
            {
              label: VIEW_TITLES.got,
              path: VIEW_PATHS.got,
              icon: "check-circle",
            },
          ].map((row) => (
            <button
              key={row.path}
              type="button"
              className="menu-item min-h-12 text-[15px]"
              onClick={() => go(row.path)}
            >
              <Icon
                name={row.icon as IconName}
                size={18}
                className="text-ink-2"
              />
              {row.label}
            </button>
          ))}
          <hr className="mx-2 my-1.5 border-hairline" />
          <button
            type="button"
            className="menu-item min-h-12 text-[15px]"
            onClick={() => go("/account")}
          >
            Settings
          </button>
          <button
            type="button"
            className="menu-item min-h-12 text-[15px]"
            onClick={() => {
              setSheetOpen(false);
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      </Modal>
    </>
  );
}

export function AppShell({
  current,
  children,
  aside,
}: {
  current: Current;
  children: React.ReactNode;
  // The item panel, beside the main column on desktop
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden lg:flex">
        <Sidebar current={current} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="lg:hidden">
          <PhoneNav current={current} />
        </div>
        <main className="flex min-w-0 flex-1 flex-col gap-5 px-5 pt-5 pb-14 sm:px-8 lg:gap-6 lg:px-8 lg:pt-10">
          {children}
        </main>
      </div>
      {aside}
    </div>
  );
}
