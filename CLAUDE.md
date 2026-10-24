# gimme

Wishlist web app at https://gimme.rtemis.dev. Owners (invite-only Cognito accounts) make lists of items from any shop and share one link. Guests (no account) claim items. The owner never sees who claimed what.

## Layout

- `frontend/`: React 19 + Vite + React Router + TanStack Query + Tailwind 4. Amplify is used for auth only.
- `lambda/`: Hono handlers. `owner/` (lists and items), `guest/` (share token and claims), `preview/` (link scraping), `claims-cleanup/` (Items stream → delete claims), `auth-emails/` (Cognito messages).
- `lib/`: AWS CDK stacks (eu-west-2, plus a us-east-1 certificate stack). DynamoDB tables: Lists, Items, Claims.
- Deploy: `npm run deploy` (builds the frontend, then `cdk deploy --all`). Local dev: `npm run dev`.

## Invariants (don't break these)

- The owner Lambda must never get access to the Claims table. Claim privacy is enforced by IAM.
- Guests are identified only by the share token in the path, and never send a listId.
- Only a hash of the claim secret is stored. The secret lives in the guest's localStorage.

## UI rules

All frontend work follows **design/SPEC.md** (the "Shelf" design). Read it before changing any UI. Reference screens are in `design/mockups/`. The non-negotiables:

- Border radius 0 everywhere. No icon library (remove `lucide-react`); use words.
- Actions are underlined text. The only boxed control is a form submit (1px ink border, no fill).
- Archivo font. Uppercase condensed page titles. Tokens and colors come from the spec only; no stock shadcn grays.
- Left-aligned layouts. Square product tiles in a grid with 2px gutters. Item state is shown on the tile.
- Simple: no flashy buttons, badges or labels; the shortest UX path. If a pattern looks like a default AI-generated UI, don't use it.
