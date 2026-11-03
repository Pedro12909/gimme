# gimme design spec: "Shelf"

The visual and UX rules for the gimme frontend. Every UI change follows this file.
Reference screens are in `design/mockups/` (see the end of this file).

## Principles

- Simple. No flashy buttons, badges or labels. Minimal but modern. The UX is the shortest path.
- It must not look AI-generated. That rules out the default shadcn look: rounded everything, stock neutral grays, Geist/Inter, icons on every button, filled pill buttons, a centred narrow column, landing pages built as headline + 3 numbered steps + CTA, skeleton shimmer, toasts for everything.
- The product photo is the content. Typography and spacing carry the rest.

## Tokens

| Token | Light | Dark |
|---|---|---|
| ground (page) | `#f4f4f2` | `#121211` |
| ink (text) | `#141414` | `#ecebe7` |
| muted text | `#6a6a66` | `#a3a29d` |
| hairline / field border | `#d6d6d2` | `#2e2e2b` |
| field background | `#ffffff` | `#1b1b1a` |
| empty tile | `#e7e7e3` | `#1f1f1d` |
| accent | `#b3261e` | `#f0705f` |
| scrim behind sheets | `rgba(20,20,20,0.4)` | `rgba(0,0,0,0.6)` |
| tile veil (got/taken) | `rgba(244,244,242,0.72)` | `rgba(18,18,17,0.72)` |

- The accent appears in exactly three places: "Want most", "Yours" (the guest's own claim), and destructive actions (Remove, Delete list).
- Text contrast is at least 4.5:1, including small muted text.

## Type

- Font: **Archivo** (variable, axes `wdth` 62–125 and `wght`). Load from Google Fonts or `@fontsource-variable/archivo`.
- Page titles: uppercase, `font-stretch: 75%`, weight 700, line-height 0.95–1. 56px on desktop, 44px on phone.
- Section titles (inside panels): uppercase, `font-stretch: 80%`, weight 700, 22px.
- Wordmark "gimme": lowercase, `font-stretch: 112%`, weight 700, 16–17px.
- Body: 14–16px, weight 400. Item names: weight 500. Meta lines (shop · price, dates): 12–14px, muted.
- Prices are shown as the owner typed them (`€279,00`). Shop and price share one line: `Apple · €279,00`.

## Shape and layout

- **Border radius is 0 everywhere**: inputs, buttons, tiles, sheets, panels, images, focus rings. (Products drawn inside images can be round; UI chrome cannot.)
- **No icon library.** Remove `lucide-react`. Use words. The only glyph is a text arrow `←` for back links.
- Layouts are left-aligned. Page container `max-width: 1216px`, 32px side padding on desktop, 16px on phone.
- Spacing follows multiples of 2 and 4. Item grids use a **2px** column gap and 24–32px row gap.
- Touch targets are at least 44px high, even when they look like plain text.

## Controls

- **Actions are underlined text** (`text-decoration: underline; text-underline-offset: 3px`). Examples: Copy share link, Settings, Claim, Undo, Cancel, Close, Edit list.
- **Form submit is the only boxed control**: 1px ink border, transparent fill, no radius, weight 500, min-height 48–52px. Examples: Send code, Create, Save, Sign in, I'll get this.
- Inputs: white field, 1px hairline border that turns ink on focus, no radius, 16px text on phone (avoids iOS zoom).
- Single-field forms attach the button flush to the right of the input (shared edge, no gap).
- Checkboxes: native, square, `accent-color: ink`, 18–20px, with a full-sentence label and an optional muted hint.
- Destructive actions are accent-colored underlined text. Confirm them with an inline second step, not a modal with two big buttons.
- Feedback is quiet: change the text in place ("Copied", "Saved") for a moment. Avoid toasts.

## Items (tiles)

- An item is a square image tile with a caption under it:
  - name (weight 500), then `shop · price` (muted), then optionally "Want most" (accent, weight 500).
  - Guest view adds the claim action under the caption.
- Grid: 4 columns on desktop owner list, 3 when the edit panel is open, 2 on phone.
- State is shown **on the tile**: a ground-colored veil at 72% with plain text bottom-left.
  - Owner: "You got this".
  - Guest: "Taken" (someone else claimed it). The guest's own claim shows "Yours · Undo" in the caption instead.
- Owners reorder by dragging tiles. No visible drag handle.

### Proposed, not decided: colored tiles

See `mockups/S-color-owner.dc.html` and `S-color-guest.dc.html`.
- Each item gets its own light tint as the tile background, with the product photo blended onto it.
- Implementation idea: `mix-blend-mode: multiply` on the `<img>` makes white product-shot backgrounds take the tint. Needs light tints, and fails on lifestyle photos.
- Tint palette (light): `#dde4ec`, `#eadfce`, `#efdad1`, `#e2e5d2`, `#ece3d4`, `#dae4d4` (plus 2 more to pick).
- Choosing the tint: automatic from the image's dominant color at preview time, owner can override in the editor. Needs a `tint` field on items (backend change).
- Dark mode needs its own tint set; multiply doesn't work on dark tiles.

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
| Claim | A bottom sheet with a scrim: item thumbnail + name, optional name field, hint "Other guests will see it. Pedro won't. You can undo later from this phone.", submit "I'll get this", Cancel link. | `S-claim-phone` |
| Dark mode | Same layout with the dark tokens. Follows the system setting; the theme toggle can stay as a text link in Account. | `S-dark-phone` |

## Mockups

`design/mockups/*.dc.html` are exported from the Claude Design canvas "gimme redesign directions". They use the canvas runtime (`support.js`, `<x-dc>`, `{{holes}}`, `<sc-for>`), so they won't render on their own. Read them for exact markup, spacing, colors and copy. The product images in them are placeholder color blocks or simple drawings.
