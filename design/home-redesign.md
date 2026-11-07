# gimme — home redesign spec (direction C, rev 2)

Status: design approved 2026-11-07, ready to implement in this repo (`~/repos/personal/gimme`).
Design canvas: "gimme home — 3 directions" (https://claude.ai/artifact/DdyLT5hAxFNKJQQkKxwiQK), artboards **C · desktop** and **C · phone**. A and B on the same canvas are rejected.
Design system: "gimme" v2 (https://claude.ai/artifact/8Rh7YdC9dLmJouxVZKZb67). This doc repeats everything needed from it, so it stands alone.

## 1. What changes

gimme is about the products you want, not about lists.

- The signed-in landing page **is the owner's default list**. The separate "your lists" screen goes away.
- One screen: **sidebar** (views, lists, account) + **main column** (the list) + **item panel** (the selected item, edited in place).
- The look goes **monochrome**: ink replaces blue, the Want-most star is ink, status colours are grey. Only `danger` keeps colour, and only for errors and confirming a delete.
- Text-button rows are replaced by **icon buttons + menus**.

## 2. Product rules

1. Every owner always has **at least one list**. A new owner gets one list named **"Wishlist"**, created on their first authenticated request (see 4.2).
2. Exactly **one default list** per owner. It opens at `/` and is marked with the house icon in the sidebar.
3. Any list can become the default from its options menu: **"Open this list first"** (hidden on the current default).
4. The **only remaining list can't be deleted**. The API refuses (409) and the menu shows "Your only list can't be deleted." in place of "Delete list".
5. Deleting the **default** while other lists exist promotes the **oldest remaining list** (by `createdAt`) to default. *Proposed, not yet confirmed by Pedro; keep it in one function so it's easy to change.*
6. Three **views across all lists**: All items, Want most (`starred`), Got it (`got`). Views are read-only aggregations; adding is disabled there (the add box only searches).
7. An item lives in one list. There is **no move**, only **Copy to another list**: the original stays (with any guest's claim), and the copy starts unclaimed. Moving would silently undo a claim nobody can see. *(Changed by Pedro, 2026-11-07.)*

## 3. Routes

| route | shows |
| --- | --- |
| `/` | default list (resolve via API, render the list in place; no redirect flash) |
| `/lists/:id` | that list |
| `/all`, `/want`, `/got` | the views |
| any of the above `?item=:itemId` | same, with the item panel open (desktop) or sheet (phone). Back button closes it. |
| `/lists/:id/preview`, `/s/:token`, `/share-target`, sign-in routes | unchanged in behaviour, restyled with the new tokens |

- Remove the lists index page (`Lists.tsx`) and its route; links that pointed to it go to `/`.
- `/share-target`: preselect the **default list** (today it only auto-picks when there is one list).
- Unknown or deleted list id → `/`.

## 4. Data and API

### 4.1 Model
- Add `isDefault: boolean` to list items in the **Lists** table. Invariant: exactly one `true` per `ownerId`.
- Setting a default = one `TransactWriteItems`: set `isDefault=true` on the new list (condition: `ownerId = :me`), set `isDefault=false` on the old one (condition: `isDefault = true AND ownerId = :me`).
- When the planned Postgres move happens, this becomes `users.default_list_id` (FK, NOT NULL) instead of a flag.

### 4.2 Ensure a default list
- Helper `ensureDefaultList(ownerId)` in `OwnerApiFn`, called by `GET /lists`:
  - Owner has no lists → create "Wishlist" with `isDefault=true` (conditional put on a deterministic id, e.g. `default#<ownerId>` hashed, so two concurrent first requests can't create two).
  - Owner has lists but none flagged (all existing accounts) → flag the oldest. This is the backfill; no migration script needed.
- Doing it lazily works regardless of how Cognito users are created (admin-created, no self sign-up).

### 4.3 Endpoints (OwnerApiFn)
- `GET /lists` → each list includes `isDefault` and `itemCount`; response also has `defaultListId`.
- `PATCH /lists/{id}` accepts `{ isDefault: true }` (false is rejected: you set another list instead).
- `DELETE /lists/{id}` → 409 `{ code: "LAST_LIST" }` if it's the only list; otherwise delete and, if it was default, promote per rule 5 in the same request. Consider batching the item deletes (today they're sequential).
- `POST /lists/{listId}/items/{itemId}/copy` `{ to }` makes a **copy** in another of the owner's lists, at the bottom of its order. An uploaded photo is copied to a new S3 key, since deleting an item deletes its photo.
- **Views**: `GET /items?view=all|want|got` across the owner's lists. If `GET /lists` already loads items per list (it does N+1 queries), the client may aggregate from that cache instead for now; either way add a TanStack Query key per view.

## 5. Tokens (CSS variables, drop into `frontend/src/index.css`)

```css
:root {
  --bg:#ffffff; --surface:#f4f4f5; --surface-2:#ebebed; --selected:#e4e4e7; --photo:#ffffff;
  --fg:#1d1d1f; --fg-2:#3a3a3c; --muted:#6e6e73; --meta:#8e8e93;
  --border:#ececec; --border-subtle:#f0f0f2; --border-strong:#d1d1d6;
  --accent:#1d1d1f; --accent-on:#ffffff; --accent-hover:#000000; --accent-active:#3a3a3c;
  --accent-tint:var(--selected); --star:var(--fg); --success:#3a3a3c; --warn:#3a3a3c; --danger:#d70015;
  --scrim:rgba(0,0,0,.2);
  --elev-menu:0 12px 32px rgba(0,0,0,.10); --elev-sheet:0 -8px 32px rgba(0,0,0,.12);
  --radius-sm:8px; --radius-md:10px; --radius-card:12px; --radius-lg:14px; --radius-pill:9999px;
  --sidebar-width:232px; --panel-width:320px; --tile-min:150px; --row-nav:38px;
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
@media (prefers-color-scheme: dark) { :root {
  --bg:#1c1c1e; --surface:#2c2c2e; --surface-2:#3a3a3c; --selected:#48484a;
  --fg:#f2f2f7; --fg-2:#d1d1d6; --muted:#98989f; --meta:#636366;
  --border:#38383a; --border-subtle:#2f2f31; --border-strong:#545458;
  --accent:#f2f2f7; --accent-on:#1c1c1e; --accent-hover:#ffffff; --accent-active:#d1d1d6;
  --success:#d1d1d6; --warn:#d1d1d6; --danger:#ff6961;
  --scrim:rgba(0,0,0,.5); --elev-menu:0 12px 32px rgba(0,0,0,.5); --elev-sheet:0 -8px 32px rgba(0,0,0,.5);
} }
:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
```
Keep the existing light/dark theme switch working (map it to the same variables). `--photo` stays white in dark.

Type (system font only, weights 400–700): page title 34/700/-0.01em (phone 28); count 15/400 `--muted`; panel name 19/600; wordmark 20/700/-0.03em; nav and menu 14 (current 600); tile name 14/500 one line; meta 13 `--muted` tabular-nums; section label "Lists" 13/600 `--muted`; buttons 14/600.

## 6. Layout

### Desktop (≥ 1024px, pointer)
Flex row, `min-height: 100dvh`:

**Sidebar** — `var(--sidebar-width)`, `--surface`, padding 20/10/12, column, gap 22. Sticky full height, scrolls on its own.
1. Wordmark "gimme".
2. Views: All items (`grid`), Want most (`star`), Got it (`check-circle`), each with count.
3. Header row: "Lists" + small `plus` icon button (new list; creates "Untitled list", navigates to it, focuses an inline title rename).
4. Lists: name (ellipsis), `home` icon on the default (`aria-label="Default list"`, row tooltip "Opens first"), count. Drag to reorder is out of scope.
5. Bottom: account button — 28px ink avatar with initial, full name, `more` icon. Opens a menu **upward**: Settings, Sign out.

Rows: `--row-nav` tall, padding 0 12, `--radius-sm`; hover `--surface-2`; current `--selected` + 600 + `aria-current="page"`.

**Main column** — fluid, `min-width: 0`, padding 40/32/56, column gap 24.
- Header: title + count (baseline-aligned, gap 12) left; right, 40px icon buttons: `share` (copy share link → tooltip/"Copied" in muted for 1.5s), `sliders` (opens a menu with the existing sort and group-by options), `more` (list options menu). On views, only `sliders`.
- List options menu: See it as a guest · Rename · Open this list first (non-default only) · Make private / Make public · New share link · divider · Delete list (two-step) or the one-line "Your only list can't be deleted."
- Search-or-add box: see 7.
- Shelf: `display:grid; grid-template-columns: repeat(auto-fill, minmax(var(--tile-min), 1fr)); gap: 28px 20px;`. Manual order and drag-and-drop ranking (dnd-kit) stay as today.

**Item panel** — `var(--panel-width)`, `--bg`, left 1px `--border`, padding 20/24/32, column gap 16, sticky, own scroll. Present only while `?item=` is set; the shelf reflows narrower (no overlay).

Between 1024 and 1279px the panel may overlay the main column from the right with `--elev-menu` instead of reflowing, if the shelf gets below 3 columns.

### Phone (< 768px; use this up to 1023px with wider margins)
- Header: wordmark left, 30px avatar right (account sheet: Settings, Sign out).
- Chip row (horizontal scroll, padding 0 20, gap 6): icon-only Want most chip (`star`), one chip per list (active = ink fill, white text, 600), dashed `plus` chip (new list). "All items" and "Got it" are in the account sheet.
- Title row: title (28) + count; `share` and `more` 44px icon buttons.
- Search-or-add box, 46px.
- Shelf: 2 columns, gaps 22/12.
- Tap a tile → bottom sheet with the panel's contents (`--radius-lg` top corners, `--elev-sheet`, over `--scrim`), drag-down or `close` dismisses.

## 7. Components

**Icon button** — 40×40 (32×32 small, 44×44 on touch), `--radius-md`, transparent, icon colour `--fg-2`, hover background `--surface` (`--surface-2` inside the sidebar). Always `aria-label` + `title`.

**Menu** — popover anchored to its button: `--bg`, 1px `--border`, `--radius-card`, `--elev-menu`, padding 6, items 40px, 14px text, hover `--surface`. Escape / outside click / choice closes and returns focus. Radix DropdownMenu is fine underneath; restyle fully.

**Search-or-add box** — 48px, `--surface`, `--radius-card`, padding 0 6 0 14, leading `search` icon in `--muted`, placeholder "Search, or paste a link to add".
- Plain text → filters the current view client-side by name + shop (no debounce needed at these sizes).
- Text matching `^https?://` → hide filtering and show an inline ink button inside the box: `plus` + "Add from {host}" (host without `www.`), 36px, `--radius-sm`. Enter = same. On a view (not a list), it adds to the default list.
- On add: run the existing `POST /preview`, create the item, clear the box, select the new item (`?item=`), so the panel opens on it.
- `⌘K` / `Ctrl+K` focuses the box from anywhere.
- This replaces the old "Paste a link to add something" field and the separate search field.

**Shelf tile** — `<button>` (opens the panel). Square photo ground `--photo`, 1px `--border`, `--radius-card`, image `object-fit: contain` with 10% padding. Name (14/500, one line) and `shop · price` (13 muted) below, gap 10. Hover: edge `--border-strong`, name underlined.
- Badge, top-right 8px in, 24px circle: **Want most** = `--accent` fill, white 13px `star`. **Got it** = `--bg` fill, 1.5px `--fg` ring, 13px `check`; whole tile (photo and caption) at opacity .45. Got wins over Want when both are set.
- Selected: `outline: 2px solid var(--accent); outline-offset: 3px;` on the photo, `aria-pressed="true"`.
- `aria-label` = name + ", want most" / ", you got this".

**Item panel**
1. Top bar: "Saved" (muted 13, only after an edit, `aria-live="polite"`, fades after 2s) · `open` (link to the item url, new tab) · `copy` (menu of other lists: "Copy to another list", then "Copied to {list}." in muted text) · `trash` (two-step remove) · `close`.
2. Photo, 4:3, `--radius-card`, 1px `--border`, white ground. Click to change image URL is out of scope.
3. Name: borderless textarea, 19/600, 2 rows max, background `--surface` on hover and focus, `--radius-sm`.
4. Property rows, each 40px with a `--border-subtle` divider: label (13 muted, 56px) + borderless 36px input (hover/focus `--surface`). Rows: **Price**, **Shop**, **Link**, **Note** (placeholder "Size, colour…"). Alternative links, size and tags from the current editor go below as further rows: **Size**, **Tags** (chips), **Also at** (alt links) — same row style.
5. Two toggles side by side, flex 1 each, 44px, `--radius-md`, `role="switch"`: `star` "Want most" and `check` "Got it". Off: `--bg`, 1px `--border-strong`. On: `--accent` fill, `--accent-on` text.
- Saving: optimistic update in the TanStack cache, `PATCH` debounced 600ms per field and flushed on blur/close. Validation errors show under the row in `--danger`, 13px.

**Two-step delete** (Remove item, Delete list): first press swaps the control for "Remove?" / "Delete list?" in `--danger` text; second press within 4s confirms; anything else cancels. No modal.

## 8. Icons

No icon library (the Lucide-on-every-button look is what made the old UI read as generated). One `Icon` component with these paths; 24 viewBox, `fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"` unless noted.

```
grid          <rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>
star (fill)   <path fill="currentColor" stroke="none" d="M12 2.5l2.9 6.2 6.8.7-5.1 4.6 1.5 6.7L12 17.3l-6.1 3.4 1.5-6.7-5.1-4.6 6.8-.7z"/>
check-circle  <circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3l2.6 2.6 5-5.4"/>
check         <path d="M6 12.5l4 4 8-9"/>            (stroke 2.4–2.6 at 13–15px)
home          <path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/>
plus          <path d="M12 5v14M5 12h14"/>
more (fill)   <circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none"/>
share         <path d="M12 3.5v11"/><path d="M8 7.5l4-4 4 4"/><path d="M6 11.5v8h12v-8"/>
sliders       <path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>
search        <circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>
open          <path d="M8 16 16 8"/><path d="M9.5 8H16v6.5"/>
copy          <rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>   (replaces move)
trash         <path d="M5 7h14"/><path d="M10 7V5h4v2"/><path d="M7 7l1 12h8l1-12"/>
close         <path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>
```

## 9. Empty and edge states

- Empty list: one line in muted ("Nothing here yet. Paste a link above.") under the box; no illustration.
- Empty view: "No items marked Want most." / "Nothing marked Got it yet."
- Search with no match: "Nothing matches “{q}”."
- Preview fetch blocked (bot wall): item is still created with the URL-slug name; panel opens so the owner can fix name/photo/price.
- Item deleted elsewhere while open → close the panel.

## 10. Keyboard and accessibility

- `⌘K`/`Ctrl+K` search box; Escape closes menu → panel; arrow keys optional.
- Focus ring 2px ink, offset 2px, everywhere. Touch targets ≥ 44px on touch devices.
- Sidebar is a `<nav aria-label="Lists and account">`; panel is `<aside aria-label="Selected item">`.
- Text AA 4.5:1 in both themes (the token pairs above pass).

## 11. Clean-up in the same change

- Delete `Lists.tsx` (index screen) and Shelf leftovers: uppercase condensed titles, ink borders on the sign-in code field and add field, the editing tile's ink outline, the `@fontsource-variable/archivo` dependency.
- Update `design/SPEC.md` to point here and to design system v2.
- Guest page: apply the new tile (Taken = faded tile + `check` badge + "Taken" as the meta line), ink primary button in the claim sheet, `close` icon for Cancel.

## 12. Acceptance checklist

- [ ] Signing in lands on the default list; refresh on `/` stays there.
- [ ] A brand-new owner sees "Wishlist" (empty) with the house icon; an existing owner's oldest list got flagged.
- [ ] "Open this list first" moves the house icon and `/` follows it.
- [ ] Deleting the only list is impossible (UI and API 409); deleting the default promotes the oldest.
- [ ] Views show items across lists with correct counts.
- [ ] Pasting a URL shows "Add from host"; Enter adds and opens the new item in the panel.
- [ ] Typing filters; ⌘K focuses the box.
- [ ] Panel edits save without a button; "Saved" appears; Want most / Got it toggles update the tile badges.
- [ ] Copy to another list and two-step Remove work from the panel; the original keeps its claim.
- [ ] Phone: chips switch lists; tile opens a bottom sheet; no sidebar.
- [ ] No blue or yellow anywhere in light or dark; `danger` only on errors/confirm steps.
- [ ] Every icon button has `aria-label` and a tooltip; keyboard focus visible everywhere.
