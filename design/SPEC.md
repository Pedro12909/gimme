> **Superseded in part (2026-11-07).** The home redesign, direction C rev 2, in
> [`design/home-redesign.md`](home-redesign.md) now wins over this file wherever they differ.
> It brings design system "gimme" v2 (https://claude.ai/artifact/8Rh7YdC9dLmJouxVZKZb67).
> - **Look:** monochrome (ink accent, ink star, grey status, only `danger` in colour).
> - **Layout:** sidebar + list + item panel, with no lists screen.
> - **Controls:** icon buttons from `components/icon.tsx` and menus.
>
> This file still covers what the redesign doesn't: the guest flow, sign-in, copy and the
> other screens.

# gimme design spec: Things 3 look

The visual and UX rules for the gimme frontend. Every UI change follows this file.
The look is based on the Things 3 system from the Open Design Agent Kit
(`claude-design-systems/things-3-ios`), adapted for gimme. It replaces the earlier "Shelf"
visuals; Shelf's screens and interactions (below) still stand. Older reference screens are
in `design/mockups/` (see the end of this file); read them for layout and copy, not colours or type.

## Principles

- Calm is the product: a white room, generous whitespace, nothing competing with the photos. When in doubt, remove.
- One blue for action, one yellow star for "Want most". Nothing else gets colour.
- Flat. No card shadows, gradients or glow. Separation comes from whitespace and hairlines; only sheets get a shadow.
- It must not look AI-generated. Still ruled out: Inter/Geist, stock shadcn grays, icons on every button, pill buttons, a centred narrow column, landing pages built as headline + 3 numbered steps + CTA, toasts for everything.
- The product photo is the content.

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| ground (page) | `#ffffff` | `#1c1c1e` | Page background |
| surface | `#f5f6f8` | `#2c2c2e` | Grouped sections; sheets in dark |
| ink (text) | `#1d1d1f` | `#f2f2f7` | Names, titles, body |
| muted text | `#6e6e73` | `#98989f` | Shop · price, dates, hints, placeholders |
| hairline | `#ececec` | `#38383a` | Dividers, the edge of a photo tile |
| field background | `#f5f6f8` | `#2c2c2e` | Inputs (no border at rest) |
| empty tile | `#ececec` | `#3a3a3c` | Tile with no photo |
| photo | `#ffffff` | `#ffffff` | Tile behind a product photo |
| accent | `#276bd9` | `#4f97ff` | Primary button, text buttons, links, focus, checkboxes |
| accent-on | `#ffffff` | `#1c1c1e` | Text on an accent fill |
| accent-hover | `#1f5ec4` | `#6aa8ff` | Hover on accent fills |
| star | `#ffd60a` | `#ffd60a` | The "Want most" star (decorative, always next to the words) |
| danger | `#d70015` | `#ff6961` | Remove, Delete list, errors |
| scrim behind sheets | `rgba(0,0,0,0.2)` | `rgba(0,0,0,0.5)` | Kept soft |
| tile veil (got/taken) | `rgba(255,255,255,0.72)` | `rgba(28,28,30,0.72)` | State over a tile |

- Light accent is Things Blue `#4f97ff` darkened, because `#4f97ff` with white text is 2.9:1. Dark keeps `#4f97ff` and puts near-black text on it.
- Text contrast is at least 4.5:1 in both themes, including small muted text.

## Type

- Font: the device's system font (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, …`). No web font.
- Weights 400, 500, 600, 700. No light weights.
- Page titles: sentence case, weight 700, 36px desktop / 28px phone, line-height ~1.15, letter-spacing 0.01em.
- Section titles (inside panels): 17px, weight 700.
- Wordmark "gimme": lowercase, weight 700, 16–17px.
- Body: 15px, weight 400. Item names: 15px weight 500 (14px on phone). Meta lines (shop · price, dates): 13px, muted, tabular figures.
- Prices are shown as the owner typed them (`€279,00`). Shop and price share one line: `Apple · €279,00`.

## Shape and layout

- Radii: 10px (`rounded-md`) for buttons, fields, tiles and panels; 8px (`rounded-sm`) for selected rows and chips; 14px (`rounded-lg`) for the top corners of bottom sheets; full for avatars and checkbox circles.
- No icon library. Use words. The only glyphs are the ★ for "Want most" and a text arrow `←` for back links.
- Layouts are left-aligned. Page container `max-width: 1216px`, 32px side padding on desktop, 16–20px on phone.
- Spacing follows multiples of 4. Item grids use a 12px column gap on phone and 20px from 640px, with 24–32px row gaps.
- Touch targets are at least 44px high, even when they look like plain text.

## Controls

- **One primary action per screen is a filled blue button** (`.submit`): accent fill, accent-on text, weight 600, 10px radius, min-height 48–52px. Examples: Send code, Create, Save, Sign in, I'll get this, Add.
- **Every other action is blue text** (`.action`): accent colour, weight 500, underline on hover only. Examples: Copy share link, Settings, Claim, Undo, Cancel, Close, Edit list. Quiet actions such as Undo can use muted text.
- Inputs: field background, no border at rest, 10px radius, accent border on focus, danger border when invalid, 16px text on phone (avoids iOS zoom).
- Single-field forms put the button to the right of the input.
- Checkboxes: native, `accent-color: accent`, 18–20px, with a full-sentence label and an optional muted hint.
- Focus: a 3px accent outline, offset 2px, on every interactive element.
- Destructive actions are danger-coloured text actions. Confirm them with an inline second step, not a modal with two big buttons.
- Feedback is quiet: change the text in place ("Copied", "Saved") for a moment. Avoid toasts.
- Loading: skeletons shaped like the content (tiles, title, fields), shown straight away, with a soft light sweep (1.4s). Blocks use the `skeleton` token (light `#e4e5e8`, dark `#333336`). With reduced motion they stay still.

## Items (tiles)

- An item is a square image tile (10px radius) with a caption under it:
  - The photo sits on a white tile with a 1px hairline edge, contained with ~9% padding. No photo: an empty tile.
  - name (weight 500), then `shop · price` (muted), then optionally "★ Want most" (yellow star, muted text).
  - Guest view adds the claim action under the caption.
- Grid: 4 columns on desktop owner list, 3 when the edit panel is open, 2 on phone. Tiles are not edge to edge on phone.
- State is shown **on the tile**: a ground-coloured veil at 72% with plain text bottom-left.
  - Owner: "You got this".
  - Guest: "Taken" (someone else claimed it). The guest's own claim shows "Yours · Undo" in the caption instead ("Yours" in ink, weight 600).
- Owners reorder by dragging tiles. No visible drag handle.

## Screens

| Screen | Behavior | Mockup |
|---|---|---|
| Landing (signed out) | Big title, one sentence, email field + "Send code" inline, "Invite-only for now" note, a strip of example tiles titled "What your friends see". No steps, no hero CTA. | `S-landing` |
| Sign in: code | One large code field, "Sign in" submit, "Send again" / "use another email" text links. | `S-signin-code` |
| Your lists | Inline "Name a new list" field + Create. Each list = 3 preview tiles + uppercase title + `date · N things · shared/private`. | `S-lists` |
| Owner list | Title, `date · N things`, text actions (Copy share link, Settings, See it as a guest), one "Paste a link to add something" field at the top, item grid. | `C-owner`, `S-owner-phone` |
| Empty list | The same page, with two empty tiles and two short lines on how to add (paste a link, or Share → gimme on Android). | `S-empty-phone` |
| Edit item | Desktop: a right-side panel (white, hairline left border, about 440px) while the list stays visible and the edited tile is outlined. Phone: a full screen. Fields: link, name, price, shop, size or colour, tags (comma separated), note for guests, other places to buy it, Want this most, Got it already. Save / Cancel / Remove. | `S-edit-item` |
| List settings | Name, date, note for guests, Private checkbox with hint, Save/Cancel, then below a hairline: "Make a new share link" with hint, "Delete this list". | `S-settings-phone` |
| Guest list | "Pedro's list" top right, title, `date · in N days`, one line explaining claims are hidden from the owner, 2-col grid with Claim / Taken / Yours · Undo. | `C-guest` |
| Claim | A bottom sheet (14px top corners, soft shadow) with a scrim: item thumbnail + name, optional name field, hint "Other guests will see it. Pedro won't. You can undo later from this phone.", submit "I'll get this", Cancel link. | `S-claim-phone` |
| Dark mode | Same layout with the dark tokens (`#1c1c1e` ground, `#4f97ff` accent). Follows the system setting until the owner picks one: a "Dark theme" / "Light theme" text link in every page's footer flips it, and Account also offers "Same as this device". | `S-dark-phone` |

## Mockups

`design/mockups/*.dc.html` are exported from the Claude Design canvas "gimme redesign directions" and still show the earlier Shelf look (Archivo, square corners, red accent): use them for layout and copy only. They use the canvas runtime (`support.js`, `<x-dc>`, `{{holes}}`, `<sc-for>`), so they won't render on their own. Read them for exact markup, spacing, colors and copy. The product images in them are placeholder color blocks or simple drawings.
