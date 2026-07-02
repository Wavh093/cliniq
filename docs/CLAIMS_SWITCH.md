# Claim switching & scrubbing

How Cliniq validates and submits medical-aid claims, and what it takes to
connect a real switch (Healthbridge / MediSwitch) later.

## What ships today (no external contract needed)

### Claim scrubbing — `api/_lib/claimScrub.js`
Pre-submission validation, mirroring what Healthbridge / VeriClaim / GoodX do
("won't let you submit unless it's correct"). `scrubClaim(claim, ref)` returns
`{ ok, errors, warnings }`.

- **errors** block submission — missing membership number, missing/future date
  of service, no ICD-10 diagnosis, no line items, a line with an unknown/inactive
  tariff code, a zero/negative fee, or a bad quantity.
- **warnings** never block — a fee above the scheme rate, a tooth-specific code
  with no/invalid FDI tooth number, an unusual membership number, or a code that
  usually needs pre-auth when no auth number is set. SA tariff rules vary by
  scheme, so these are advisory.

Reference data (`validCodes`, `authCodes`, `toothCodes`, `feeByCode`) is
resolved from `dental_tariff_codes` (see migration 038 for the
`requires_tooth` / `requires_auth` flags) by the API before calling the pure
scrubber.

Wired into `api/appointments.js`:
- `POST ?resource=claims` runs the scrubber first; hard errors return **422**
  with the list (pass `&force=1` to override, e.g. a code not yet in the tariff
  table).
- `POST ?resource=claims&action=scrub` is a **dry run** — validate a draft claim
  and get `{ ok, errors, warnings }` back without saving.

### Manual submission — `api/_lib/claimSwitch.js`
`getClaimSwitch()` returns the adapter chosen by the `CLAIM_SWITCH` env var
(default `manual`). Manual mode marks the claim `submitted` and leaves
transmission to the practice's existing channel; the remittance is captured via
`POST /api/revenue?resource=remittance` when it returns.

## Connecting a real switch later

1. Get a provider agreement + credentials (Healthbridge or a MediSwitch
   reseller). You'll receive host/base URL, API credentials, and per-scheme
   destination codes.
2. Implement `makeHttpSwitch()` in `api/_lib/claimSwitch.js`: build the
   provider's claim payload from the Cliniq claim + lines, POST it, and map the
   response onto `ClaimSubmitResult` (`status`, `reference`, `message`, `raw`).
3. Add env vars (Vercel): `CLAIM_SWITCH=healthbridge` (or `mediswitch`),
   `SWITCH_BASE_URL`, `SWITCH_API_KEY` / practice credentials.
4. No caller changes — `api/appointments.js` already submits through
   `getClaimSwitch().submit(claim)` on the draft→submitted transition.

### Membership & benefit verification (not built)
Real-time eligibility ("is the member active, what funds are left") is a
separate switch call. It would follow the same adapter pattern: a
`verifyMembership(scheme, membershipNo)` seam with a manual stub now and a real
implementation once credentials exist. Deferred until there's a switch to call.
