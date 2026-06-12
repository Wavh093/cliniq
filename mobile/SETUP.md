# OH Dental Mobile — Setup Guide

## 1. Fill in your Supabase anon key

Open `app.json` and replace `REPLACE_WITH_SUPABASE_ANON_KEY` with the anon key from:
> Supabase Dashboard → Project Settings → API → Project API Keys → `anon public`

## 2. Run the database migration

In Supabase Dashboard → SQL Editor, run the contents of `../migrations/013_push_tokens.sql`:
```sql
ALTER TABLE staff ADD COLUMN IF NOT EXISTS expo_push_token text;
```

## 3. Install dependencies

```bash
cd mobile
npm install
```

## 4. Run on your phone (development)

```bash
npx expo start
```
Scan the QR code with the **Expo Go** app (iOS App Store / Google Play).

> Push notifications require a physical device. They won't fire in the simulator.

## 5. Build for production (app store / direct install)

Install EAS CLI and build:
```bash
npm install -g eas-cli
eas login
eas build:configure       # creates eas.json, gets a project ID
```

Then update `app.json` → `extra.eas.projectId` with the ID shown after configure.

```bash
eas build --platform android   # produces .apk / .aab
eas build --platform ios       # requires Apple Developer account
```

## How push notifications work

1. Doctor opens app on their phone → app requests notification permission
2. Expo generates a push token and saves it to the `staff` table via `/api/notify?action=save-token`
3. When a patient books online (`POST /api/bookings`), the server sends a push message
   to every staff member who has a token registered
4. The notification appears instantly on the doctor's phone
