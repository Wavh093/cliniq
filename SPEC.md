# Cliniq — Product Specification

*A dental practice-management platform for South African dental practices.*

> **Purpose of this document:** a complete, plain-English description of what Cliniq does, who uses it, and how. It is written to be fed to an LLM (e.g. Claude) to generate **user stories** for client walkthroughs. It contains no code, no credentials, and no implementation detail beyond what's needed to understand behaviour. See the final section for instructions on generating user stories from it.

---

## 1. Product Overview

**Cliniq** is a multi-platform practice-management system for dental practices. It replaces the paper diary, spreadsheet billing, and ad-hoc patient files that small-to-mid dental practices typically run on, with a single connected system spanning three surfaces:

1. **Staff Web Dashboard** — the day-to-day control centre used by reception and clinicians on a desktop/laptop in the practice.
2. **Staff Mobile App** (iOS/Android) — a companion app for clinicians to view their day, patient records, and stats on the go.
3. **Patient-Facing Web** — public pages where prospective and existing patients can book appointments, self-check-in, and leave reviews.

A built-in AI assistant, **Klara**, is available on both staff surfaces to answer operational questions and help with clinical and admin tasks.

**Market context:** built for South African practices — Rand (ZAR) currency, medical-aid (private health insurance) billing workflows, and **POPIA** (Protection of Personal Information Act) consent tracking are first-class concepts.

**Business model:** SaaS sold per-practice. The system is multi-tenant-ready (every record belongs to a practice), with a roadmap toward self-service practice onboarding and subscription billing.

---

## 2. User Roles

| Role | Where they work | What they do |
|---|---|---|
| **Admin / Practice Owner** | Web dashboard (primary), Mobile | Full access: staff management, all clinical + financial data, settings, analytics. |
| **Dentist / Clinician** | Mobile (primary), Web | Sees their schedule, patient records, treatment plans; records clinical notes and treatment actuals; views stats. |
| **Receptionist / Front Desk** | Web dashboard (primary) | Books and manages appointments, registers and checks in patients, handles messages and reviews, takes payments. |
| **Patient** (external) | Patient-facing web | Books appointments, completes self-check-in intake, leaves post-treatment reviews. |
| **Prospective Patient** (external) | Patient-facing web | Browses, makes a first booking, submits contact enquiries. |

---

## 3. Platforms & Surfaces

### 3.1 Staff Web Dashboard
The main workspace. A left sidebar navigates between modules; a top bar shows the practice name and a global search/menu. The Klara AI assistant floats on every page as a chat bubble. Navigation modules: **Overview, Appointments, Patients, Treatment Plans, Analytics, Inventory, Revenue, Services, Messages, Reviews, Settings.** (A Claims/Pre-Authorisation module exists but is currently hidden — see §5.13.)

### 3.2 Staff Mobile App
A 7-tab app for clinicians: **Today, Calendar, Patients, Plans, Analytics, Ask Klara, Settings.** Designed for quick reference between patients — view the day, open a patient profile, edit notes, check stats, ask Klara. Includes a personalised greeting ("Good morning, Dr [Name]").

### 3.3 Patient-Facing Web
Public pages: a **booking** flow (choose service/time, enter details), a **self-check-in / onboarding** intake form (demographics, medical history, medical-aid details, POPIA + treatment consent), and a **post-treatment review** form.

---

## 4. Core Concepts & Data

- **Practice** — the tenant. Every record belongs to one practice. Has name, contact details, location, timezone, working hours.
- **Staff** — a practice employee with a role (admin/dentist/receptionist) and an active/inactive flag, linked to a login.
- **Patient** — full demographic + medical profile: identity, contact, date of birth, gender, SA ID number, address, referral source, medical-aid details, allergies/medications/conditions, dental-anxiety level, consent flags (treatment + POPIA + marketing), and patient type (new/returning).
- **Service** — a treatment type the practice offers (e.g. Consultation, Scaling & Polishing, Filling, Extraction, Root Canal, Crown), with a category, default duration, and price.
- **Appointment** — a booking linking a patient, a service, a date/time, and a duration. Has a workflow status (pending → confirmed → in progress → completed, or cancelled/no-show) and three note fields: patient notes (from booking), clinical notes (from the dentist), internal notes (staff-only). Payment fields capture how the visit was paid (self-pay and/or medical aid).
- **Treatment Plan** — a multi-session course of treatment for a patient, broken into individual **sessions** (each with a date, status, charge, and payment) and tracked with progress and totals.
- **Inventory Item** — a stock item (consumable, instrument, medication, PPE, material, equipment) with a running quantity, reorder threshold, cost, and supplier. Stock movements are logged as transactions.
- **Review** — a patient's post-treatment rating and comment.
- **Message / Contact Submission** — an inbound enquiry from the contact form.

---

## 5. Feature Modules

### 5.1 Authentication & Staff Management
- Staff log in with email + password.
- Sessions auto-expire after inactivity (idle sign-out with a warning).
- Admins can add, edit, deactivate staff and assign roles.
- Every authenticated action verifies the user is an active staff member of the practice.

### 5.2 Overview / Dashboard Home
- At-a-glance daily snapshot: today's appointments, key stats (e.g. expected bookings, collected revenue), and attention items.
- **No-show follow-up tasks** — recent no-shows surface as actionable items with a one-tap WhatsApp follow-up link and a dismiss action.
- Alerts for things needing attention (e.g. low stock, unread messages).

### 5.3 Appointments & Calendar
- Book a new appointment: pick patient (or create one), service, date, time, duration.
- View appointments by day; manage status (confirm, start, complete, cancel, mark no-show).
- Cancellations capture a reason.
- Link walk-in / returning-patient bookings to existing patient records.
- **Mobile calendar:** monthly view with multi-dot markers on days that have appointments; tap a day to see its list; tap an appointment to open the patient.

### 5.4 Patients
- Searchable patient directory (by name/phone), with new-vs-returning indicators.
- Full patient profile organised into tabs: **Profile** (personal info), **Medical Aid**, **Health** (allergies, medications, conditions, anxiety), **Appointments** (history).
- Edit demographics and clinical/internal notes.
- **POPIA consent** is captured and tracked separately from treatment consent.
- Self-check-in: patients can complete their own intake on the patient-facing web, creating/updating their record.

### 5.5 Treatment Plans
- Create a plan for a patient as a series of sessions.
- Track plan status (active/paused/completed), per-session status, progress bar, and payments.
- Record payments against sessions; see outstanding balance.
- Mobile: list of plans with status badges; tap for full detail.

### 5.6 Services Catalogue
- Maintain the list of treatments offered: name, category, duration, price.
- Used as the basis for booking, scheduling duration, and revenue estimation.

### 5.7 Revenue & Payments
- Revenue view summarises, for a chosen period: estimated revenue (from booked services + plan sessions), amount collected, amount outstanding, inventory cost, and net revenue.
- Per-appointment payment capture supporting **medical-aid split-stream**: the portion billed to/received from the medical aid and the portion paid by the patient are tracked separately (with a simpler self-pay path when there's no medical aid).
- Treatment-plan session payments roll into the same revenue totals.

### 5.8 Inventory
- Stock master list with live quantities.
- Record stock movements (in / out / adjustment / write-off / return).
- **Low-stock awareness:** items at or below their reorder threshold are flagged.
- Expected consumption per procedure can be mapped to services for forecasting and to estimate per-appointment material cost.

### 5.9 Analytics
- Trends over time: revenue, appointment counts, and service breakdown by month.
- Mobile analytics with a month picker.
- CSV export and an audit log of key changes.

### 5.10 Reviews
- Collect post-treatment reviews (rating + comment) via the patient-facing form.
- Staff see a summary (average rating, good/neutral/bad breakdown) and recent comments.

### 5.11 Messages / Contact
- Inbound contact-form enquiries land in a Messages inbox.
- Staff can read, mark status, and reply by email.

### 5.12 Klara — AI Assistant
Klara is an in-product assistant available on both staff surfaces (a chat bubble on web, an "Ask Klara" tab on mobile).

**Klara can:**
- Answer **operational stats** questions from live practice data: appointment counts (today, this week, this month, next 7/30 days, and **any custom date range** within a recent window), revenue (this week / this month: estimated, collected, outstanding), **low-stock inventory**, patient counts (total, new vs existing, registered today), and a **review summary**.
- Answer **general/clinical questions** using web search (e.g. clinical guidelines, product information).
- Help **draft replies** to patient reviews and assist with dashboard tasks.
- On mobile, answer clinical questions for the dentist on the go (rate-limited).

**Klara will not (by design — privacy):**
- Reveal or look up any **individual patient's** personal data (name, contact, ID, medical history, payments). It is only ever given aggregate counts and totals — never patient records — and will direct staff to the Patients page instead.
- Invent numbers. If a figure isn't in its data or a date falls outside the available window, it says so rather than guessing.

### 5.13 Claims / Pre-Authorisations *(roadmap — currently hidden)*
Backend support exists for medical-aid claims, claim line items, remittances, and pre-authorisations. The UI is hidden pending a claims-clearinghouse integration (e.g. Healthbridge). Listed here because it is part of the product vision.

### 5.14 Notifications *(roadmap)*
Push notifications to staff mobile devices (e.g. appointment reminders, new bookings) and patient booking-confirmation emails are designed but not yet switched on.

---

## 6. Key Workflows (end-to-end)

1. **New patient books online → first visit.** Prospective patient books a slot on the public site → record created as "new" → receptionist confirms → patient completes self-check-in intake (with POPIA consent) → dentist sees them on Today → records clinical notes → payment captured → patient marked returning.
2. **Walk-in.** Receptionist registers the patient (or links to an existing record) and books them into an open slot for today.
3. **Course of treatment.** Dentist proposes a multi-session treatment plan → sessions scheduled over time → each session completed and paid → progress tracked to completion.
4. **Daily front-desk run.** Receptionist opens Overview → confirms today's appointments → follows up no-shows via WhatsApp → handles inbox messages → takes payments → checks low-stock alerts.
5. **Owner reviews the business.** Admin opens Analytics/Revenue for the month → asks Klara "how much did we collect this week and how many appointments next week?" → reviews ratings and low-stock items.
6. **Clinician on the move.** Dentist opens the mobile app between patients → checks the next appointment → opens the patient profile → updates notes → asks Klara a clinical question.

---

## 7. Non-Functional Characteristics

- **Multi-tenant:** every record is scoped to a practice; data is isolated per practice. (Currently deployed single-practice; architecture supports many.)
- **Security & privacy:** server-side verification that the user is active staff for the practice on every protected action; row-level data isolation; the AI assistant is structurally prevented from accessing individual patient PII.
- **POPIA compliance:** explicit, separately-tracked consent for treatment, POPIA, and marketing.
- **Localisation:** ZA-centric — Rand currency, SA ID numbers, medical-aid billing, Johannesburg timezone, South African phone formats.
- **Cross-platform:** consistent data across web dashboard, mobile app, and patient web.
- **Resilience:** the assistant and notifications degrade gracefully (an unavailable assistant or email service never blocks core booking/clinical workflows).

---

## 8. Out of Scope / Future Roadmap

- Self-service practice sign-up and onboarding.
- Subscription / billing layer.
- Per-practice custom branding (colours, logo) and subdomains.
- Medical-aid claims clearinghouse integration (re-enable Claims UI).
- Live push notifications and automated patient emails/reminders.
- App-store distribution of the mobile app.

---

## 9. How to Generate User Stories from This Spec

> Paste this entire document into Claude (or another LLM) along with a prompt like the one below.

**Suggested prompt:**

> "You are a product analyst. Using the attached Cliniq product specification, generate user stories I can walk a prospective dental-practice client through. Requirements:
> - Group stories by **user role** (Admin/Owner, Dentist, Receptionist, Patient) and then by **feature module** (§5).
> - Use the format: *"As a [role], I want [capability], so that [benefit]."*
> - For each story add **acceptance criteria** as a short bulleted checklist (Given/When/Then style where useful).
> - Mark stories that depend on roadmap features (§5.13, §5.14, §8) as **[Future]**.
> - Prioritise each story as Must-have / Should-have / Could-have.
> - Keep the language client-friendly (no technical jargon) since I'll present these in a sales/discovery walkthrough.
> - End with a short list of **open questions** to ask the client during the walkthrough (e.g. their current workflow, medical-aid mix, number of chairs/clinicians)."

**Tips:**
- Ask for a smaller "demo script" version (8–12 headline stories) for the first client meeting, then a full backlog afterwards.
- Have the LLM tailor the medical-aid and POPIA stories to the specific province / practice size if the client shares that.
- The Atlas Dentistry demo environment can be used to *show* these stories live during the walkthrough.

---

*This spec describes product behaviour only. Technical setup, environment variables, and credentials live in the (gitignored) internal handoff document, not here.*
