import { useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  LinkIcon,
  ShareIcon,
  SparklesIcon,
} from "lucide-react";
import { ItemSummary } from "@/components/item-summary";
import { Button } from "@/components/ui/button";
import type { ViewableItem } from "@/lib/item-view";
import { cn } from "@/lib/utils";

// Sample data for the landing page. Everything here is drawn with the same components
// the real lists use, so the page shows the app as it actually looks.

// Stand-in product photos: a soft tile with an emoji, so the demo needs no external images
const photo = (emoji: string, tint: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="${tint}"/><text x="32" y="43" font-size="30" text-anchor="middle">${emoji}</text></svg>`,
  )}`;

type DemoItem = ViewableItem & { claimerName?: string };

const item = (
  itemId: string,
  fields: Omit<DemoItem, "itemId" | "createdAt">,
): DemoItem => ({ itemId, createdAt: "", ...fields });

const ITEMS = {
  headphones: item("headphones", {
    url: "https://www.fnac.pt",
    title: "Wireless noise-cancelling headphones",
    price: "€79.00",
    vendor: "Fnac",
    tags: ["tech"],
    imageUrl: photo("🎧", "#e0e7ff"),
  }),
  book: item("book", {
    url: "https://www.bertrand.pt",
    title: "The Midnight Library",
    price: "€12.90",
    vendor: "Bertrand",
    tags: ["books"],
    imageUrl: photo("📚", "#fef3c7"),
  }),
  pourOver: item("pour-over", {
    url: "https://www.etsy.com",
    title: "Ceramic pour-over coffee set",
    price: "€34.50",
    vendor: "Etsy",
    tags: ["kitchen"],
    imageUrl: photo("☕", "#fde2e4"),
  }),
  scarf: item("scarf", {
    url: "https://www.uniqlo.com",
    title: "Merino wool scarf",
    price: "€29.90",
    vendor: "Uniqlo",
    size: "One size",
    note: "Dark green",
    imageUrl: photo("🧣", "#dcfce7"),
  }),
  camera: item("camera", {
    url: "https://www.amazon.es",
    title: "Instant camera",
    price: "€99.00",
    vendor: "Amazon",
    tags: ["tech", "photo"],
    imageUrl: photo("📷", "#e0f2fe"),
    alternatives: ["https://www.worten.pt"],
  }),
  plant: item("plant", {
    url: "https://www.ikea.com",
    title: "Monstera in a woven basket",
    price: "€24.00",
    vendor: "IKEA",
    tags: ["home"],
    imageUrl: photo("🪴", "#ecfccb"),
  }),
  game: item("game", {
    url: "https://www.amazon.es",
    title: "Wingspan board game",
    price: "€49.99",
    vendor: "Amazon",
    tags: ["games"],
    imageUrl: photo("🐦", "#fae8ff"),
  }),
  shoes: item("shoes", {
    url: "https://www.nike.com",
    title: "Trail running shoes",
    price: "€110.00",
    vendor: "Nike",
    size: "EU 42",
    imageUrl: photo("👟", "#ffedd5"),
  }),
  candle: item("candle", {
    url: "https://www.zarahome.com",
    title: "Fig & cedar candle",
    price: "€19.99",
    vendor: "Zara Home",
    tags: ["home"],
    imageUrl: photo("🕯️", "#f5f5f4"),
  }),
  vinyl: item("vinyl", {
    url: "https://www.fnac.pt",
    title: "Vinyl record: Rumours",
    price: "€27.99",
    vendor: "Fnac",
    tags: ["music"],
    imageUrl: photo("🎶", "#e7e5e4"),
  }),
};

const claimed = (demo: DemoItem, claimerName: string): DemoItem => ({
  ...demo,
  claimed: true,
  claimerName,
});

// A list card as guests see it; the static version behind the hero
function ListCard({
  title,
  items,
  className,
}: {
  title: string;
  items: DemoItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-72 shrink-0 rounded-xl border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <p className="font-semibold tracking-tight">{title}</p>
      <ul className="mt-2 divide-y">
        {items.map((demo) => (
          <li key={demo.itemId} className="flex items-center gap-3 py-2.5">
            <ItemSummary item={demo} dimmed={demo.claimed}>
              {demo.claimed && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Claimed by {demo.claimerName}
                </p>
              )}
            </ItemSummary>
            {!demo.claimed && (
              <span className="rounded-lg border px-2.5 py-1.5 text-sm font-medium">
                Claim
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const BACKDROP_COLUMNS: { title: string; items: DemoItem[] }[][] = [
  [
    {
      title: "Maya's 30th",
      items: [ITEMS.camera, claimed(ITEMS.book, "Tom"), ITEMS.plant],
    },
    {
      title: "New flat",
      items: [ITEMS.candle, claimed(ITEMS.pourOver, "Inês")],
    },
  ],
  [
    {
      title: "Christmas",
      items: [claimed(ITEMS.scarf, "Mum"), ITEMS.vinyl, ITEMS.game],
    },
    {
      title: "Running gear",
      items: [ITEMS.shoes, claimed(ITEMS.headphones, "Rui")],
    },
  ],
  [
    {
      title: "Birthday ideas",
      items: [ITEMS.headphones, ITEMS.book, claimed(ITEMS.candle, "Sara")],
    },
    {
      title: "Things I'd love",
      items: [ITEMS.pourOver, ITEMS.camera],
    },
  ],
  [
    {
      title: "Wedding list",
      items: [claimed(ITEMS.plant, "Ana"), ITEMS.scarf, ITEMS.game],
    },
    {
      title: "Book club",
      items: [ITEMS.book, claimed(ITEMS.vinyl, "Leo")],
    },
  ],
  [
    {
      title: "Secret Santa",
      items: [ITEMS.candle, ITEMS.shoes, claimed(ITEMS.camera, "João")],
    },
    {
      title: "Home office",
      items: [ITEMS.headphones, ITEMS.plant],
    },
  ],
];

// Tilted columns of real-looking lists drifting slowly behind the hero.
// Decorative only: hidden from screen readers and unreachable by keyboard.
export function AppBackdrop() {
  return (
    <div
      aria-hidden="true"
      inert
      className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden select-none"
      style={{
        maskImage: "linear-gradient(to bottom, black 55%, transparent)",
      }}
    >
      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 -rotate-12 gap-4 opacity-40 sm:opacity-60 dark:opacity-30 sm:dark:opacity-40">
        {BACKDROP_COLUMNS.map((cards, column) => (
          <div
            key={column}
            className={cn(
              "flex flex-col motion-safe:animate-drift",
              column % 2 === 1 && "[animation-direction:reverse]",
            )}
            style={{ animationDuration: `${70 + column * 12}s` }}
          >
            {/* Two copies so the loop restarts without a visible jump */}
            {[0, 1].map((copy) =>
              cards.map((card) => (
                <ListCard
                  key={`${copy}-${card.title}`}
                  {...card}
                  // Margin, not gap, so both copies are exactly the same height
                  className="mb-4"
                />
              )),
            )}
          </div>
        ))}
      </div>

      {/* Keeps the headline readable over the busy background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% 30%, var(--background) 35%, transparent 100%)",
        }}
      />
    </div>
  );
}

// Guest view of a shared list. Claiming works here, but only in this page.
export function SharedListDemo() {
  const [mine, setMine] = useState<Set<string>>(new Set());
  const items = [
    ITEMS.headphones,
    ITEMS.pourOver,
    ITEMS.scarf,
    claimed(ITEMS.book, "Tom"),
  ];

  const toggle = (itemId: string) =>
    setMine((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

  return (
    <BrowserFrame path="/s/maya-30th">
      <p className="text-lg font-semibold tracking-tight">Maya's 30th</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Anything from here makes my day.
      </p>
      <ul className="mt-3 divide-y border-y">
        {items.map((demo) => {
          const claimedByMe = mine.has(demo.itemId);
          const isClaimed = demo.claimed || claimedByMe;

          return (
            <li key={demo.itemId} className="flex items-center gap-3 py-3">
              <ItemSummary item={demo} dimmed={isClaimed}>
                {isClaimed && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {claimedByMe
                      ? "Claimed by you"
                      : `Claimed by ${demo.claimerName}`}
                  </p>
                )}
              </ItemSummary>
              {!isClaimed && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => toggle(demo.itemId)}
                >
                  Claim
                </Button>
              )}
              {claimedByMe && (
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => toggle(demo.itemId)}
                >
                  Unclaim
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </BrowserFrame>
  );
}

function BrowserFrame({
  path,
  children,
}: {
  path: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-background shadow-xl shadow-black/5 dark:shadow-black/40">
      <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </div>
        <p className="min-w-0 flex-1 truncate rounded-md bg-background px-3 py-1 text-center text-xs text-muted-foreground">
          gimme{path}
        </p>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

// Small static panels for the "how it works" steps
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      inert
      className="rounded-xl border bg-card p-4 shadow-sm select-none"
    >
      {children}
    </div>
  );
}

export function AddItemDemo() {
  return (
    <Panel>
      <p className="text-sm font-medium">Link</p>
      <div className="mt-2 flex h-11 items-center gap-2 rounded-lg border px-3 text-sm">
        <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">fnac.pt/wireless-headphones-xm5</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <ItemSummary item={ITEMS.headphones} />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <SparklesIcon className="size-3.5" />
        Name, photo, shop and price filled in for you
      </p>
    </Panel>
  );
}

export function ShareDemo() {
  return (
    <Panel>
      <p className="font-semibold tracking-tight">Maya's 30th</p>
      <p className="text-sm text-muted-foreground">4 items</p>
      <div className="mt-3 flex h-11 items-center gap-2 rounded-lg border bg-muted/40 pr-1 pl-3 text-sm">
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          gimme/s/maya-30th
        </span>
        <span className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-foreground">
          <CopyIcon className="size-4" />
          Copy
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <span className="flex h-9 items-center justify-center gap-1.5 rounded-lg border font-medium">
          <ShareIcon className="size-4" />
          Share
        </span>
        <span className="flex h-9 items-center justify-center gap-1.5 text-muted-foreground">
          <CheckIcon className="size-4" />
          No account needed
        </span>
      </div>
    </Panel>
  );
}

export function SurpriseDemo() {
  return (
    <div className="grid gap-3">
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          What your friends see
        </p>
        <Panel>
          <div className="flex items-center gap-3">
            <ItemSummary item={claimed(ITEMS.pourOver, "Inês")} dimmed>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Claimed by Inês
              </p>
            </ItemSummary>
          </div>
        </Panel>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          What you see
        </p>
        <Panel>
          <div className="flex items-center gap-3">
            <ItemSummary item={ITEMS.pourOver} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
