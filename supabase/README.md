# Supabase Setup — OH Dental Studio

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) → New project
2. Name: `oh-dental-studio`
3. Region: **South Africa (Cape Town)** — closest to Krugersdorp
4. Save the database password somewhere safe

## 2. Run the migrations in order

Go to **SQL Editor** in the Supabase dashboard and run each file in sequence:

| File | What it does |
|---|---|
| `001_schema.sql` | All tables |
| `002_functions_triggers.sql` | Helper functions, updated_at triggers, audit log, inventory balance, availability function |
| `003_indexes.sql` | Performance indexes |
| `004_rls.sql` | Row-Level Security policies |
| `005_seed.sql` | OH Dental practice row, working hours, services, starter inventory, analytics views |

## 3. Create the first admin user

1. Supabase dashboard → **Authentication → Users → Invite user**
2. Enter the admin's email address
3. Copy the UUID that appears in the users list
4. In `005_seed.sql`, uncomment the `INSERT INTO staff` block, replace `<<AUTH_USER_ID>>`, and run it

## 4. Grab your API keys

From **Project Settings → API**:

| Key | Where it goes |
|---|---|
| `Project URL` | `SUPABASE_URL` env var |
| `anon / public` key | Used in the frontend (safe to expose) |
| `service_role` key | Used in Vercel serverless functions only — **never expose in the browser** |

## 5. Environment variables

Create a `.env.local` file (never commit this):

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
RESEND_API_KEY=re_...
```

---

## Key design decisions

**`auth_practice_id()` function**
Every RLS policy resolves the current auth user → their staff row → their `practice_id`. This means a compromised JWT can only ever access one practice's data.

**`compute_available_slots()`**
A SQL function that reads the practice schedule and subtracts booked appointments. The API calls this instead of doing the logic in Node — keeps it fast and consistent.

**Audit log**
Written by `SECURITY DEFINER` triggers, not by application code. Staff cannot bypass or tamper with it.

**Immutable transactions**
`inventory_transactions` has no UPDATE or DELETE RLS policies. Stock history is append-only.

**Analytics views**
`v_monthly_bookings`, `v_revenue_estimate`, `v_patient_demographics`, `v_inventory_variance`, `v_low_stock` — query these directly from the admin dashboard. Add to Supabase's built-in dashboard as saved queries for quick reference.
