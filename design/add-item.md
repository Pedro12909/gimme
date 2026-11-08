# gimme — add item: the composer

Status: design approved 2026-11-07, ready to implement.
Design canvas: "gimme add item" (https://claude.ai/artifact/U7vhj51qB3VVuznwmLsuFi), boards 1–9. Board 10 ("More details in the composer") is rejected and shown only for comparison.
Follows `design/home-redesign.md` and the "gimme" design system v2 (monochrome). This doc repeats every value needed.

## 1. What changes

Adding is one of the two main flows (with viewing), so it gets a visible, fast entry point instead of today's hidden "paste a link anywhere on the page".

- A **composer**: a Raycast-style one-line window over the list. Type a name, optionally with a pasted link, press Enter.
- **Nothing is read from the shop.** The composer never calls `POST /preview`: link previews are unreliable. The name is what you type; photo, price, shop, size and the rest are added later in the item panel.
- **Items no longer need a link.** A name alone is a valid item.
- The composer adds several items in a row (stays open), or adds one and opens it in the panel (⌘Enter).

## 2. Opening and closing

| how | where |
| --- | --- |
| Ink **+** button, 48×48, `rounded-card`, right of the sort-and-group button in the search row; tooltip "Add an item" with an `N` key hint | desktop (board 1) |
| **N** key, when focus is not in a text field and no menu/sheet is open | desktop |
| Floating ink **+**, 56×56 circle, `right: 20px; bottom: max(34px, env(safe-area-inset-bottom) + 16px)`, `--elev-menu`-like shadow `0 12px 32px rgba(0,0,0,.18)` | phone (board 8) |
| Pasting text containing an http(s) link while no field is focused | both. Replaces today's silent add: the composer opens with that link as a chip and the rest of the text as the name |
| A link shared into the app (Android share target, `ShareTarget.tsx` → `location.state.addText`) | both. Same as paste: composer opens prefilled, nothing is added until Enter / Add |

**⌘K stays with search** (`search-box.tsx`); the composer does not use it.

Closes on Esc, on a click on the scrim, on the phone sheet's drag-down, and after ⌘Enter. Focus returns to the + button. Closing with text typed simply discards it (no confirm).

## 3. Layout

### Desktop (boards 2–7)
- Scrim `--scrim` over the whole app (sidebar included). Composer is a `role="dialog"` with `aria-label="Add an item"`, `aria-modal="true"`, focus trapped.
- 600px wide, horizontally centred, `top: 15vh` (120px in the 800px board). `--bg`, 1px `--border`, `rounded-lg` (14px), `--elev-menu`, `overflow: hidden`.
- Three stacked parts, separated by 1px `--border` lines:
  1. **Input row**, 60px, padding `0 16px 0 20px`, gap 10–12: `plus` icon 20px in `--muted`; the link chip (if any); the text input (19px, no border, placeholder `--meta`); an `esc` key hint.
  2. **Body**, padding 8px: the hint (empty state), the result row, the "Added" list, or a notice.
  3. **Footer**, 48px, padding `0 12px`, gap 8: list chip, Want most switch, flexible space, key hints.

### Phone (board 9)
- The same parts inside the existing `components/sheet.tsx` (bottom sheet, `rounded-lg` top, `--elev-sheet`, grabber), sitting on top of the keyboard. Padding `8px 16px 14px`, gap 12.
- The input is a 48px `--surface` field (`rounded-card`), 16px text (no zoom on iOS), with a clear (`close`) icon button.
- The footer becomes a row of real buttons: list chip (40px), Want most as a 40×40 icon switch, and an ink **Add** button (44px, `rounded-md`, 15/600) on the right, since there is no ⌘Enter on a phone. The keyboard's return key also adds.
- Key hints (`esc`, `↵`, `⌘↵`, `⌘L`) are hidden on touch devices.

## 4. The input

- Plain text is the **name**.
- A pasted or typed http(s) URL (detected with the existing `extractLink` + `safeHref`) is lifted out of the text into a **link chip** placed before the input: 26px tall, `--surface` fill, 1px `--border`, radius 6px, 13px `--fg-2` text showing `siteName(url)` (e.g. `fnac.pt`), and a 20×20 `close` icon button (`aria-label="Remove the link"`). Backspace in an empty input removes the chip. Only one link per item; pasting another replaces it.
- With a chip and no name, the placeholder becomes **"Name it"**.
- Empty-state placeholder: **"Paste a link or type a name"**.

## 5. The body

| state | what shows | board |
| --- | --- | --- |
| Empty | one line, 13px `--muted`, padding `14px 20px 16px`: **"A name is enough. Add the rest later."** | 2 |
| Name typed (with or without chip) | the **result row** | 3, 5, 7 |
| Chip, no name | the result row, named from the link (below) | 4 |
| After adding | "Added to {list}" label and the items added in this session | 6 |
| List is full | notice in place of the row: the existing `FULL_NOTICE` copy, `--muted`; Add disabled | — |
| Add failed | the row stays, with "Couldn't add it. Try again." under it in `--danger`, 13px | — |

**Result row** (`role="listbox"` with one `role="option" aria-selected="true"`): `--surface` fill, radius 10px, padding `10px 12px`, gap 14:
- a 56×56 photo slot: dashed 1px `--border-strong`, radius 8px, white, with the `image` icon (new, §8) 20px in `--meta`. New items never have a photo;
- two lines: **`Add “{name}”`** (15/500, ellipsis) and a meta line (13px `--muted`): the chip's `siteName` when there is a link, otherwise "No link yet. Add a shop, photo and price later.";
- a `↵` key hint on the right.

**Named from the link** (board 4): Enter with a chip but no name uses the existing client-side `slugName(url)` (falls back to `siteName(url)`), and the meta line reads `{site} · named from the link`. The row always shows exactly what will be saved, so there are no surprises. No network call.

**Added list** (board 6): label "Added to {list name}" (12/600 `--muted`), then one 48px row per item added since the composer opened, newest first: 36×36 photo slot (dashed, `image` icon 16px), name (14/500), site name (13 `--muted`). Only the newest row has an **Undo** text button (13/600, `--fg`), which deletes that item. The input clears and its placeholder becomes **"Add another…"**. The footer's right side shows "Done" + `esc`. The new tiles appear in the list behind as they're added.

## 6. The footer

- **List chip** (`aria-haspopup="menu"`): 28px (40px on phone), `--surface`, radius 8px, 13/500: the `home` icon if it's the default list, the list name, a `chevron` (new, §8). Defaults to the list on screen; on a view (All items, Want most, Got it) to the default list. Click, or **⌘L / Ctrl+L** from anywhere in the composer, opens a menu (the existing `components/menu.tsx`) of all lists with a `check` on the chosen one and `home` on the default (board 7); arrow keys and Enter pick, Esc closes it. While the menu is open the footer's right side shows "Change list" + `⌘L`.
- **Want most switch**: `role="switch"`, 28px, radius 8px. Off: transparent, outline star, 13px `--fg-2`. On: `--accent` fill, filled star, `--accent-on` text, 500. Resets to off after each add.
- **Key hints** on the right: `Add ↵` (13/500 `--fg`; `--meta` when there's nothing to add) | 1px divider | `Add and edit ⌘↵` (13 `--muted`). Key caps: min 20×20, 1px `--border-strong`, radius 5px, 11/500 `--muted`.

## 7. Behaviour

- **Enter**: adds the item (`POST /lists/{listId}/items` with `title`, `url` if any, `starred` if on) to the chosen list, then shows it in the Added list and clears the input. The composer stays open.
- **⌘Enter / Ctrl+Enter**: adds, closes the composer and selects the new item so the item panel opens (desktop) or its sheet (phone). On a view where the item wouldn't show, navigate to its list with `?item=` as `addByLink.onSuccess` does today.
- **Esc**: closes the list menu if open, otherwise the composer.
- Adding is optimistic: the tile appears at once (`addItemToCache`); on failure it's removed and the row shows the error.
- Remove the `previewLink` call from the add path (`addByLink` in `Home.tsx`) and the "Adding from {site}…" placeholder tile. The `/preview` endpoint and `lambda/preview` stay for now (see §11).
- `newItemInput(url, preview)` in `lib/item-input.ts` becomes `newItemInput({ title, url?, starred })` with no preview argument.

## 8. Icons (add to `components/icon.tsx` and design system §7)

Same style: 24 viewBox, `fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`.

```
chevron   <path d="M6 9l6 6 6-6"/>                    (stroke 2.2 at 12px)
image     <rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20 16l-5-5-8 8"/>
star-outline  the star path with fill="none", stroke 2   (the Want most switch when off)
```

## 9. Items without a link (backend and the rest of the app)

**Owner Lambda** (`lambda/owner/item-input.ts`, `index.ts`):
- Create: `url` becomes optional. Rule: at least one of `title` or `url` is required (`"title or url is required"`). A present `url` must still be http(s).
- Update: `url: ""` clears it (removed like other cleared fields). Refuse an update that would leave neither `title` nor `url`.
- Copy (`/copy`) and the guest Lambda need no change beyond tolerating a missing `url`.

**Frontend**:
- Types: `url?: string` on `Item`, `SharedItem` and `ItemInput`.
- `siteName()` and `itemLabel`/`itemVendor` in `lib/item-view.ts` handle a missing url (title is then always present).
- Tile (`components/tile.tsx`): unchanged look; an item with no `imageUrl` already shows the empty photo slot. Check the caption's meta line when there's no vendor and no url (shows only the price, or nothing).
- Item panel: drop the "An item needs a link" error; an empty Link row is fine. Hide the `open` (open in shop) icon button when there's no link. Placeholders that use `siteName(item.url)` need a fallback.
- Guest page (`guest-list-view.tsx`): no link → no "open" affordance; claiming works the same.
- `item-view.ts` grouping/sorting by shop: items with neither vendor nor url go to an "Other" group, last.

## 10. Accessibility

- Dialog: `role="dialog"`, `aria-modal`, labelled; focus starts in the input. Tab moves focus normally: chip's remove button → input → list chip → Want most → (phone) Add.
- Result row is announced via `aria-live="polite"` on the body; the Added list too.
- All icon-only buttons have `aria-label` and a tooltip. Touch targets ≥ 44px on touch devices.

## 11. Open questions (decide during implementation or ask Pedro)

1. Keep or delete `POST /preview` and `lambda/preview` now that nothing calls it from adding? (Recommendation: delete in a follow-up once the composer ships.)
2. Undo: delete the item (simple) or soft-delete? Spec assumes delete.

## 12. Acceptance checklist

- [ ] Desktop: ink + in the search row opens the composer; N opens it; ⌘K still focuses search.
- [ ] Phone: floating + opens the composer as a sheet above the keyboard, with an Add button.
- [ ] Typing a name and pressing Enter adds an item with no link and no photo; the composer stays open with "Add another…".
- [ ] Pasting a link makes a chip; typing a name and Enter adds name + link. Nothing is fetched from the shop (no `/preview` request in the network tab).
- [ ] Chip with no name: the row shows the name taken from the link; Enter saves exactly that.
- [ ] ⌘Enter adds and opens the item panel on the new item.
- [ ] List chip defaults correctly (current list, or default list on a view); click and ⌘L open the list menu; Tab moves focus normally.
- [ ] Want most switch sets `starred`, resets after each add.
- [ ] Undo removes the latest added item.
- [ ] Pasting a link outside any field, and sharing into the app, open the composer prefilled instead of adding silently.
- [ ] Items without a link work everywhere: tile, panel (no "needs a link" error, no open-in-shop button), guest page, grouping by shop, copy to another list.
- [ ] API: create with only `title` → 201; with neither → 400; update `url: ""` clears it.
- [ ] Monochrome only; key hints hidden on touch; focus visible everywhere.
