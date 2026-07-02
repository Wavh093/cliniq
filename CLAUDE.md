# Cliniq — engineering notes for Claude

Dental practice-management platform for South African practices (ZAR, medical
aid, POPIA). Product behaviour is specced in `SPEC.md`. Single-tenant deploy
today, multi-tenant-ready (`PRACTICE_ID` env scopes every query).

## Architecture

- **No build step.** The web surfaces are standalone HTML files with React 18
  UMD + Babel standalone compiled in the browser:
  - `admin.html` — staff dashboard (~11k lines, one `<script type="text/babel">`)
  - `index.html` — public patient site + booking widget
  - `onboarding.html` — patient self-check-in intake
  - `review.html` — post-treatment review form
  - `document.html` — sick-note/referral viewer (sandboxed iframe)
- **API**: Vercel serverless functions in `api/*.js` (CommonJS, Node ≥20).
  Kept ≤12 files for the Vercel Hobby-plan function cap — several endpoints
  are folded into one file behind `?resource=`/`?action=` params
  (`appointments.js` hosts treatment plans, sessions, branches, claims,
  time blocks; `notify.js` hosts push webhook + save-token + ai-ask;
  `reviews.js` hosts the Klara Gemini chat).
- **DB**: Supabase Postgres. Base schema in `supabase/migrations/`
  (001–015), later migrations in `migrations/` (013+). Migrations are applied
  manually via the Supabase SQL editor — there is no migration runner.
- **Mobile**: `mobile/` is an Expo (React Native) staff app; talks to the same
  API with a Supabase staff JWT.

## Auth model (important)

- `api/_lib/supabase.js` exports `requireAuth` (valid Supabase JWT) and
  `requireStaff` (JWT **plus** active row in `staff` matched on
  `staff.user_id`). **Anything touching PII, money, or clinical data must use
  `requireStaff`** — this was audited 2026-07; keep it that way.
- Public (unauthenticated, rate-limited) endpoints: `POST /api/bookings`,
  `GET /api/bookings` (slots), `GET /api/services` (active only),
  `POST /api/contact`, `POST /api/reviews`, `POST /api/patients?onboarding=true`,
  `GET /api/staff?resource=config`.
- `POST /api/notify` (push webhook) authenticates via `x-webhook-secret`
  header matching `NOTIFY_SECRET` (timing-safe compare).
- Service-role key is server-side only; the browser gets the anon key from
  `/api/staff?resource=config`.

## Commands

```sh
npm run dev                       # vercel dev (needs Vercel + Supabase env)
npm run deploy                    # vercel --prod
node scripts/api-smoke-test.js    # API handler tests vs in-memory Supabase mock
node scripts/ui-test.mjs          # Playwright suite driving the real admin.html
node scripts/dev-stub-server.js   # stub API + static server on :4173 (manual poking)
```

UI test prerequisites (not in package.json to keep prod deps lean):
`npm i --no-save playwright-core chart.js @babel/standalone@7.26.10` and the
React UMD production builds copied to `node_modules/react-local/`
(`react.production.min.js`, `react-dom.production.min.js` from the
react/react-dom 18.3.1 npm tarballs). Chromium comes from
`/opt/pw-browsers/chromium` in CI/sandboxes. NB: `npm i --no-save` prunes
previously unsaved packages — install them all in one command.

Syntax-check the dashboard after editing (it compiles in the browser, so a
typo = blank page):

```sh
node -e "const m=require('fs').readFileSync('admin.html','utf8').match(/<script type=\"text\/babel\">([\s\S]*?)<\/script>/);require('@babel/standalone').transform(m[1],{presets:['react']});console.log('JSX OK')"
```

## Conventions & gotchas

- PostgREST builders are **thenables without `.catch()`** — chain `.then()`
  first or just `await` and read `{ data, error }`. Calling `.catch()` on the
  builder throws synchronously (this bit us in staff.js).
- Soft deletes everywhere: filter `deleted_at IS NULL` in every query **and**
  in SQL functions (see migration 036 for the slot-availability fix).
- Appointment/session status changes go through explicit transition maps
  (`VALID_TRANSITIONS` in `api/appointments.js`, mirrored in admin.html).
- `compute_available_slots(practice, date, duration)` is the single source of
  truth for bookable slots; the public booking POST re-validates against it.
- SA specifics: phone = 10 digits starting 0 (or +27 + 9); SA ID = 13 digits
  with embedded DOB + Luhn checksum (`saIdError()` in admin.html); passports
  = 1 letter + 8 digits; currency formatted as `R1 234.56`.
- WhatsApp links must convert local numbers: `0XX…` → `27XX…`
  (`waNumber()` in admin.html) — `wa.me/0…` silently fails.
- In admin.html, don't define components inside components and render them as
  `<JsxTags/>` — the type identity changes every render, remounting the
  subtree and swallowing clicks that race a re-render. Hoist them, or call as
  plain functions `{Foo(props)}` (see the AddPatientModal footer).
- Email HTML in API responses must escape user input (`escapeHtml` in
  bookings.js / contact.js).
- User-facing dates use `en-GB`/`en-ZA`; practice timezone is SAST (UTC+2),
  computed as `Date.now() + 2h` server-side (no DST in SA).

## Deploy checklist

1. Apply any new files in `migrations/` via the Supabase SQL editor.
2. `git push` → Vercel preview; merge to `main` → production.
3. Env vars (Vercel): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `PRACTICE_ID`, `RESEND_API_KEY`,
   `NOTIFY_SECRET`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`,
   `GOOGLE_MAPS_API_KEY` (optional).
4. Staff accounts must have `staff.user_id` linked to their auth user or
   they'll get 403s from `requireStaff`.
