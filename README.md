# Aurelius IELTS

A premium IELTS learning platform for students and teachers, built with Next.js 15, TypeScript,
Tailwind CSS, Prisma and Firebase Authentication.

## Stack

- **Frontend** — Next.js 15 (App Router), TypeScript, Tailwind CSS v4, hand-built shadcn-style UI
  primitives, Framer Motion.
- **Backend** — Next.js Server Actions, PostgreSQL, Prisma ORM.
- **Auth** — Firebase Authentication for identity only (email/password, Google, password reset).
  Application data — role, StudentProfile/TeacherProfile, and everything else — lives in Postgres
  via Prisma, linked back to Firebase by `User.firebaseUid`. Sessions are HttpOnly cookies verified
  server-side with the Firebase Admin SDK; role-based route protection runs in `src/lib/session.ts`
  (the authoritative check) with a cheap cookie-presence fast path in `src/middleware.ts` (Edge
  runtime can't run the Admin SDK).

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   Copy `.env.example` to `.env` and fill in the values:

   ```bash
   cp .env.example .env
   ```

   - `DATABASE_URL` — a PostgreSQL connection string.
   - **Firebase project** — create one at the [Firebase Console](https://console.firebase.google.com/),
     then in **Authentication → Sign-in method** enable **Email/Password** and **Google**.
   - **Client config** (`NEXT_PUBLIC_FIREBASE_*`) — Project settings → General → Your apps → Web
     app → SDK setup and configuration. These are public values, safe to expose to the browser.
   - **Admin credentials** (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
     — Project settings → Service accounts → Generate new private key. These are server-only
     secrets; never commit the downloaded JSON or expose it to the client.
   - Add `http://localhost:3000` to **Authentication → Settings → Authorized domains** for local
     Google sign-in to work.

3. **Push the schema to your database**

   ```bash
   npm run db:push
   ```

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command              | Description                              |
| -------------------- | ----------------------------------------- |
| `npm run dev`         | Start the dev server                      |
| `npm run build`       | Production build                          |
| `npm run start`       | Start the production server               |
| `npm run lint`        | Run ESLint                                |
| `npm run db:push`     | Push the Prisma schema to the database    |
| `npm run db:migrate`  | Create/apply a dev migration              |
| `npm run db:studio`   | Open Prisma Studio                        |

## Project structure

```
prisma/schema.prisma        Database schema
src/app/
  (auth)/                    Login, register, forgot-password (split-screen layout)
  (dashboard)/student/*      Student dashboard shell + skill/analytics pages
  (dashboard)/teacher/*      Teacher dashboard shell + management/analytics pages
  (exam)/student/exam/*      Full-screen exam-taking flow (no dashboard chrome)
  onboarding/                Role picker for first-time sign-ins with no profile yet
src/actions/                 Server actions (session, registration, onboarding, exam, teacher tools)
src/components/
  ui/                        Hand-built UI primitives (button, card, dialog, table, ...)
  layout/                    Dashboard shell, sidebar, user menu
  dashboard/, analytics/     Stat cards, charts, empty states
  auth/, marketing/          Auth forms, landing page sections
src/lib/
  firebase/                  Client SDK (browser), Admin SDK (server-only), shared constants
  session.ts                 requireUser/requireRole/requireStudentProfile/requireTeacherProfile
  exam/, analytics/          Grading, band conversion, teacher/student insights
src/middleware.ts            Cookie-presence fast path only — real verification is server-side
```

## Notes on data

Every number shown in a dashboard is read live from Postgres — there is no seeded or mocked
data. A new student starts at a 0.0 band score, 0 tests completed, 0% progress and an untracked
weakness ("Not enough data") until they actually complete scored tests, and a new teacher starts
with empty Students/Tests/Reviews/Payments lists until real records exist. Band scores are a
teacher-maintained raw-score conversion table, not an AI estimate.
