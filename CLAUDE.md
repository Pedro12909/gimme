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

## UI rules

All frontend work follows **design/SPEC.md** (a Things 3–based look that replaced the earlier "Shelf" design). Read it before changing any UI. The mockups in `design/mockups/` still show Shelf: use them for layout and copy only, not colours or type. The non-negotiables:

- Calm white page, flat: no gradients or card shadows; only bottom sheets get a soft shadow. Tokens, colours and radii come from the spec only (`index.css`); no stock shadcn grays.
- Radii: 10px (`rounded-md`) for buttons, fields, tiles and panels; 8px (`rounded-sm`) for small bits; 14px (`rounded-lg`) for bottom sheet tops.
- The device's system font, no web font. Sentence-case page titles (`.page-title`), nothing uppercase or condensed.
- One blue accent for action, a yellow ★ only for "Want most", danger red for destructive actions and errors. Nothing else gets colour.
- One primary action per screen is a filled blue `.submit` button. Every other action is blue `.action` text, underlined on hover only (quiet ones such as Undo can be muted). No icon library; use words.
- Fields: grey fill, no border at rest. Don't put them on a grey surface or they disappear; panels and sheets use the page colour.
- Left-aligned layouts. Square product tiles (white with a hairline edge for photos) in a spaced grid, not edge to edge. Item state is shown on the tile.
- Loading uses the shimmering skeletons in `components/skeleton.tsx`, shaped like the content. Feedback is quiet text in place, not toasts.
- Simple: no flashy buttons, badges or labels; the shortest UX path. If a pattern looks like a default AI-generated UI, don't use it.
