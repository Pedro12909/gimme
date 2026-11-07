# gimme

Wishlist web app at https://gimme.rtemis.dev. Owners (invite-only Cognito accounts) make lists of items from any shop and share one link. Guests (no account) claim items. The owner never sees who claimed what.

## Layout

- `frontend/`: React 19 + Vite + React Router + TanStack Query + Tailwind 4. Amplify is used for auth only.
- `lambda/`: Hono handlers. `owner/` (lists and items), `guest/` (share token and claims), `preview/` (link scraping), `claims-cleanup/` (Items stream → delete claims), `auth-emails/` (Cognito messages).
- `lib/`: AWS CDK stacks (eu-west-2, plus a us-east-1 certificate stack). DynamoDB tables: Lists, Items, Claims, Owners (display name shown to guests). S3 images bucket for uploaded item photos: browsers upload to `pending/` with a presigned POST, saving the item copies to `images/` (the only prefix CloudFront serves).
- Deploy: `npm run deploy` (builds the frontend, then `cdk deploy --all`). Local dev: `npm run dev`.

## Invariants (don't break these)

- The owner Lambda must never get access to the Claims table. Claim privacy is enforced by IAM.
- Guests are identified only by the share token in the path, and never send a listId.
- Only a hash of the claim secret is stored. The secret lives in the guest's localStorage.
- Items are never moved between lists, only copied (the copy is unclaimed). A move would silently undo a guest's claim, and the owner can't see claims. A copied uploaded photo gets its own S3 key, because deleting an item deletes its photo.
- Every owner has at least one list, and exactly one has `isDefault: true` (Lists table). `ensureDefaultList` in the owner Lambda makes the first list and fixes up a missing default. Changing the default is one transaction, and deleting the last list is refused (409 `LAST_LIST`).

## UI rules

All frontend work follows **design/home-redesign.md** (direction C, design system "gimme" v2). For anything it doesn't cover, use **design/SPEC.md**. Read them before changing any UI. The mockups in `design/mockups/` show the old Shelf look: use them for copy only. The non-negotiables:

- One screen for owners: sidebar (views, lists, account) + the list + the item panel (a bottom sheet on phones). The default list opens at `/`; there's no lists screen.
- Monochrome. Ink (`--accent`) is the accent and the Want-most star; status colours are grey. Only `danger` has colour, and only for errors and the confirm step of a delete. No blue or yellow anywhere.
- Flat white page: no gradients or card shadows. Only menus (`--elev-menu`) and sheets (`--elev-sheet`) get a shadow. Tokens, colours and radii come from `index.css` only; no stock shadcn grays.
- Radii: 8px (`rounded-sm`) small bits, 10px (`rounded-md`) buttons and fields, 12px (`rounded-card`) tiles, menus and the search box, 14px (`rounded-lg`) sheet tops.
- The device's system font, no web font. Sentence-case titles (`.page-title`), nothing uppercase or condensed.
- Icons come only from `components/icon.tsx` (no icon library). Icon buttons (`IconButton`) always have `aria-label` and a tooltip. Options live in menus (`components/menu.tsx`), not rows of text buttons. One filled ink `.submit` per screen at most.
- Deleting is two steps in place (`useTwoStep`: "Remove?" in danger red, a second press within 4s). No modals for confirming.
- Item edits save themselves (debounced, flushed on blur and close), with a quiet "Saved". There's no Save button in the panel.
- Square tiles on a white photo ground with a hairline edge. State is shown as a badge, and Got it / Taken also fade the tile.
- Loading uses the shimmering skeletons in `components/skeleton.tsx`, shaped like the content. Feedback is quiet text in place, not toasts.
- Simple: the shortest UX path. If a pattern looks like a default AI-generated UI, don't use it.
