# Cadence

A personal running, walking and nutrition coach for monthly mileage challenges. People create an account, set up a challenge and their usual week, and get a realistic day-by-day plan that adapts as they log activity, food and energy.

It is a web app that can be installed on a phone's home screen.

---

## Deploy to Vercel

Cadence on Vercel needs four things: the code on GitHub, a Vercel project, a Postgres database and two environment variables. It takes about 15 minutes.

### 1. Put the code on GitHub

From the project folder:

```bash
git init
```

```bash
git add -A
```

```bash
git commit -m "Cadence"
```

Then create an empty **private** repository on github.com and follow its "push an existing repository" instructions. The `.gitignore` already leaves out your local database, backups and `.env`.

### 2. Create the Vercel project

1. On vercel.com, choose **Add New → Project** and import the repository.
2. Vercel reads `vercel.json`, so the build settings are already filled in. Don't deploy yet.

### 3. Add a database

1. In the project, open **Storage → Create Database → Neon (Postgres)**, choose the free plan and connect it to the project.
2. This adds `DATABASE_URL` to the project's environment variables automatically.
3. Cadence creates its tables on first use, so there's nothing else to run.

### 4. Set environment variables

Under **Settings → Environment Variables**:

| Variable | Required | What it's for |
|---|---|---|
| `SESSION_SECRET` | yes | Signs sign-in cookies. Use 32 or more random characters. Generate one with `openssl rand -base64 48`. |
| `DATABASE_URL` | yes | Added by Neon in step 3. |
| `INVITE_CODE` | recommended | If set, people need this code to create an account. Without it, anyone who finds the address can sign up. |
| `ANTHROPIC_API_KEY` | optional | The daily AI coach's note and AI food estimates (see below). Whoever owns the key pays for everyone's usage. |
| `ANTHROPIC_WORKSPACE_ID` | only for some keys | Needed if the AI says the key "is not scoped to a workspace". Use the workspace ID (starts `wrkspc_`) from console.anthropic.com → Settings → Workspaces. |

### 5. Deploy and check

1. Deploy.
2. Open `https://<your-app>.vercel.app/api/health`. It should show `{"ok":true,"storage":"postgres"}`. If anything is missing, the response lists what to fix.

### 6. Move your existing data across (optional)

1. Create your account on the hosted app.
2. On the first setup screen, choose **Import an export file**, or later go to Settings → Your data → Import.
3. Pick `backups/cadence-my-data-export.json`. It already contains your October challenge, activities, food, calendar and settings.

### Install on a phone

Open the hosted address on the phone, then:
- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** menu → **Install app**.

Cadence then opens full screen with its own icon. It needs a connection to load or save data. Without one, the app still opens and shows a "can't reach" message.

---

## Accounts and privacy

- Accounts use an email and password, with a minimum of 10 characters. Passwords are stored as salted scrypt hashes.
- Sign-in uses an HTTP-only, signed cookie that lasts 30 days.
- After 5 wrong passwords, an account is locked for 15 minutes.
- Every piece of data (activities, food, wellbeing and cycle notes, calendar) belongs to one account. The API only ever reads or writes the signed-in user's data, and the tests check this.
- Users can change their password, export everything as JSON or CSV, import, reset, or delete their account and all of its data from Settings.
- **Not built yet:** password reset by email. It needs an email provider such as Resend or Postmark. Until then, if someone forgets their password, the app owner has to delete that user from the database.

## AI coach's note and food estimates

With `ANTHROPIC_API_KEY` set:
- **Coach's note:** each person gets a short note in the Today block, written once a day from a summary of their progress, plan, energy and food. They can tap Refresh to get a new one.
- **"What did you eat today?":** typed meals (and photos) are estimated and answered with a short coach response in a single AI call. The response looks at food logged today and yesterday alongside training from the last five days and what's planned today and tomorrow, and ends with a specific next step. The meal type is chosen from the time of day.

Without a key, the note is hidden, estimates come from the built-in food list, and the response to a logged meal comes from built-in rules.

Each person is limited per day to **6 notes** and **40 food estimates**. Change these with `AI_DAILY_NOTES` and `AI_DAILY_FOOD_ESTIMATES`.

Rough cost with Claude Opus 5.5: about 2–6p per note and about 2–4p per logged meal, so roughly £2–5 per person per month. **Set a monthly spending limit** in your Anthropic account.

Mileage maths and the plan always come from Cadence's own planner. The AI only writes the note and the estimates.

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

It runs at http://localhost:4321. Locally, Cadence uses a SQLite file at `data/cadence.db`, with no database setup needed. If that file came from the original single-user version, **the first account you create on this machine adopts that data**. A backup from before the switch to accounts is in `backups/`.

Tests:

```bash
npm test
```

To run the server tests against Postgres (using PGlite, a real Postgres engine that runs inside Node), the database driver used on Vercel:

```bash
npm run test:postgres
```

## New users' setup

The first-run setup asks for:
- **The challenge:** a target in miles or km (the unit you pick is used across the app), what counts (walking, running, cycling, boxing, swimming — pick any), the dates, and any distance already done. Distance already done is dated to the last day of the previous week, so the current week starts clear.
- **The usual week:**
  - a list of day types, starting from suggestions (Office day, Work from home, Morning movement, Evening movement, Weekend, Too busy) that can be deleted, plus any the person adds;
  - one day type for each day of the week.
- **Office-day details**, only if an office day is used: commute walking and an optional longer walk.
- **Comfortable run distances**, only if running counts.

Everything can be changed later in Settings and the weekly pattern (on the daily distance chart). Tap any day on that chart to edit it.

**Activity types:** walking, running, cycling and swimming add distance to the target. Boxing is tracked by time (it counts as a session and an active day, not as distance). The planner schedules runs and walks; other activities count when they're logged.

**Custom day types** behave like a flexible day with a few short windows and no long runs; their time blocks can be edited in the weekly pattern. The suggested types have sensible windows built in.

## How the coach decides

1. **Calendar.** Each day comes from the weekly pattern or a date-specific change, minus any commitments (including travel time). Only *preferred* and *optional* time blocks are used for planning.
2. **Opportunities.**
   - **Office days:** the user's commute walking, plus their optional longer walk.
   - **Run-straight-after days:** a run once work ends.
   - **Work-from-home days:** a lunchtime run.
   - **Weekends with a long free window:** a long run.
3. **Recovery rules.** No run the day after a long run, at most 2 run days in a row, at most 4 a week, and no late runs after office days. All of these can be changed in Settings.
4. **Closing the gap.** The smallest realistic additions come first. If the plan still falls short, it says so instead of piling on miles.
5. **Fitting what's left.** Each time distance is logged, the flexible sessions for the rest of the challenge are re-fitted to the distance still needed. They shrink in proportion, to the nearest half mile, or the latest drop out when they'd be too short. Sessions you planned yourself and commute walking keep their distance.
6. **Period days.** Sessions on period days (logged or expected) are 20% lighter, or 30% lighter when your own energy logs show a clear dip, and extra mileage is added to other days first.
7. **Today.** Energy, what's already been logged, windows that have passed, day plans the user has set, and unavailable days all re-plan the rest of the month.

## Project layout

```
api/index.js     Vercel serverless entry (wraps the Express app)
server/app.js    API routes (all per-user)
server/auth.js   Accounts and session cookies
server/db.js     Storage: Postgres (DATABASE_URL) or local SQLite
server/ai.js     Optional Claude coach's note and food estimates
src/shared/      Deterministic logic shared by server and UI (planner, coach, nutrition, reviews…)
src/             React front end (Vite)
public/          PWA manifest, service worker, icons
scripts/         Icon generator; legacy-data exporter
tests/           node:test suites (AI tests use a fake Anthropic server; tests/postgres runs them on Postgres)
```
