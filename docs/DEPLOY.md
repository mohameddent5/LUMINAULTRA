# Deploying Lumina Ultra

The app is one Node process (Express API + built React client). It needs a Postgres database and two environment variables. Nothing here costs money by itself; hosting and the database are what you choose and pay for.

## 1. What you need
- A Postgres database (any provider; a free tier is enough to start). Copy its connection string.
- A host that runs Node 20+ (Render, Railway, Fly.io, a VPS, or Replit). HTTPS is required: browsers only allow the camera on HTTPS.

## 2. Environment variables
| Name | Value |
|---|---|
| `DATABASE_URL` | the Postgres connection string from step 1 (a NEW database, not the one that leaked in the old `.env`) |
| `SESSION_SECRET` | a long random string, for example from `openssl rand -hex 32` |
| `NODE_ENV` | `production` |
| `ALLOW_REGISTRATION` | leave unset for the first run; set to `false` after you create your own account so nobody else can sign up |

Never commit these. `.env` is git-ignored; `.env.example` shows the names.

## 3. First run
```
npm install
npm run db:push      # creates the users and user_data tables
npm run build
npm start            # serves on $PORT (default 5000)
```
Open the site, choose "New clinic? Create an account", then set `ALLOW_REGISTRATION=false` and restart.

## 4. Check it works
- `GET /api/health` returns `{"ok":true,"database":true}`. If `database` is false, `DATABASE_URL` is not being read.
- Sign in, add a patient through the scanner or archive, reload the page, sign in on another device: the record is there.
- If a red "Changes are not saving" banner appears, the server cannot be reached or the database is down.

## 5. Before real patients
- Rotate the old database password; the old `.env` is still in git history.
- Back up the database (your provider's backups, plus the Settings > Export button).
- Keep the consent record: each saved capture stores when the clinician confirmed patient consent.
- The neural net was trained on synthetic images and is not validated on real photographs. Use the tool as a design and visualization aid, not for diagnosis.
- Snapshot images are stored inside the database as JPEG data. Fine for a small clinic; move to object storage before large scale.
