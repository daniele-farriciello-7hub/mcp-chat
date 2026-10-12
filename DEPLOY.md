# Deploy

How mcp-chat gets from a branch to a running site. Everything lives in one Firebase project,
`mappa-contatti-217007`; production and development are two **apps of the suite** inside it.

## Environments

|                 | Production                                    | Development                                               |
| --------------- | --------------------------------------------- | --------------------------------------------------------- |
| Branch          | `production` (default branch)                 | `development`                                             |
| Site            | https://assistente-7hub.web.app               | https://assistente-7hub-development.web.app               |
| Hosting target  | `production` → site `assistente-7hub`         | `development` → site `assistente-7hub-development`        |
| App id          | `assistente-7hub`                             | `assistente-7hub-development`                             |
| Firestore data  | `apps/assistente-7hub/…`                      | `apps/assistente-7hub-development/…` (same database)      |
| Storage folder  | `assistente-7hub/`                            | `assistente-7hub-development/`                            |
| Permission key  | `users/{uid}.permessi_app['assistente-7hub']` | `users/{uid}.permessi_app['assistente-7hub-development']` |
| Cloud Functions | `database`, `history`, `tools`                | `databaseDev`, `historyDev` (twins, same code)            |
| Build flag      | none                                          | `NEXT_PUBLIC_APP_ENV=development`                         |

What decides the environment:

- **Front-end**: `NEXT_PUBLIC_APP_ENV`, read at build time by `src/shared/environment.js`. It sets the app
  id (Firestore root, Storage folder, permission key) and which function names are called (`database` →
  `databaseDev`).
- **Functions**: `functions/index.js` wraps each handler with `forApp(app, handler)`
  (`functions/src/appContext.js`); every path, permission check and cache follows the app of the request.
  The development twins never read or write under `apps/assistente-7hub`.

Shared by both: the sign-in (same accounts), the Firebase project, the MariaDB connections (development
holds copies of production's, so its queries read the real gestionale database, read-only) and the
Firestore security rules.

## Release flow

```
feature branch ──merge──▶ development ──(test on the dev site)──▶ fast-forward ──▶ production
```

1. Work on a branch created from `development`.
2. Merge it into `development` and push. GitHub deploys the development site and the development functions.
3. Test on https://assistente-7hub-development.web.app.
4. Bring `production` to the same commit — a fast-forward, never a separate merge with different code:

   ```bash
   git fetch origin
   git push origin origin/development:production
   ```

   GitHub deploys the production site and the production functions.

Only `production` ever deploys the production functions; only `development` deploys the twins.

## Automatic deploys (GitHub Actions)

| Workflow                                   | On push to    | Deploys                                                                    |
| ------------------------------------------ | ------------- | -------------------------------------------------------------------------- |
| `.github/workflows/deploy-production.yml`  | `production`  | `hosting:production` + `functions:assistente:database`, `history`, `tools` |
| `.github/workflows/deploy-development.yml` | `development` | `hosting:development` + `functions:assistente:databaseDev`, `historyDev`   |

Both install, run `npm run lint` and `npm run build` first: a lint or build error stops the deploy and the
site stays as it was. Both can also be started by hand from the repository's **Actions** tab (**Run
workflow**). Follow a run with:

```bash
gh run list -R daniele-farriciello-7hub/mcp-chat --limit 5
gh run watch <run-id> -R daniele-farriciello-7hub/mcp-chat
```

### Secrets

Repository → Settings → Secrets and variables → Actions:

| Secret                     | What                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT` | JSON key of the service account `mcp-chat-deploy@mappa-contatti-217007.iam.gserviceaccount.com`           |
| `DB_CRED_KEY`              | the key that decrypts stored database passwords — **identical** to `functions/.env.mappa-contatti-217007` |

`DB_CRED_KEY` must be exactly the same value: a different key leaves every stored password undecryptable,
and every database question fails. Both workflows refuse to start if it is missing. They write it to
`functions/.env.mappa-contatti-217007` on the runner, which is where `firebase deploy` reads it.

A quick way to check the key matches: after a production deploy with no function code changes, the log
says `Skipped (No changes detected)` for the functions — the environment is part of what Firebase compares.

### Service account roles

`mcp-chat-deploy` needs, on the project: Cloud Functions Admin, Firebase Hosting Admin, Service Account
User, Service Usage Consumer, Firebase Extensions Viewer (the deploy lists the installed extensions).
The project also needs the Cloud Billing API enabled (the functions deploy checks the billing plan).
Granting roles needs a project **owner**.

## Manual deploy (emergencies only)

Prefer a push: it builds from the branch, so what runs is what is committed. If GitHub is unavailable:

```bash
cd /path/to/mcp-chat && nvm use 22
```

Production — from the `production` branch, clean working tree:

```bash
npm run build && firebase deploy --only hosting:production,functions:assistente:database,functions:assistente:history,functions:assistente:tools
```

Development — from the `development` branch:

```bash
NEXT_PUBLIC_APP_ENV=development npm run build && firebase deploy --only hosting:development,functions:assistente:databaseDev,functions:assistente:historyDev
```

- **Always build right before deploying.** `firebase deploy` publishes whatever is in `out/`; deploying
  without building, or after a build for the other environment, publishes the wrong site silently.
- `functions/.env.mappa-contatti-217007` must exist locally with `DB_CRED_KEY` (never committed).
- Never run a bare `firebase deploy --only functions`: it would deploy the twins from a production build or
  the production functions from a development one.

## Running locally

```bash
nvm use 22 && npm install && (cd functions && npm install)
firebase emulators:start --only functions   # functions on :5001, real Firestore
npm run dev                                 # http://localhost:3001, as the DEVELOPMENT app
```

`npm run dev` reads `.env.development`, so localhost runs as `assistente-7hub-development` and needs that
permission. To run locally against production data and permissions instead:

```bash
NEXT_PUBLIC_APP_ENV=production npm run dev
```

There is no Firestore emulator: locally you work on the real data of whichever app you chose. Saving
settings from a local production run changes them for the live site.

## Setting up the development app (done once)

Already done on 2026-10-09; repeat only to rebuild it.

1. **Data** — copy settings and database connections from production:

   ```bash
   cd functions && node scripts/seed-development.mjs           # dry run: shows the counts
   cd functions && node scripts/seed-development.mjs --write   # copies
   ```

   Documents are not copied (their files are production's), nor conversation history (personal data).

2. **Permissions** — in userconf, give testers the app `assistente-7hub-development` (with `isAdmin` for
   whoever configures it). Without it the site shows "account non abilitato".
3. **Sign-in and App Check** — the dev domains must be in Firebase Auth → Authorised domains and in the
   reCAPTCHA key's allowed domains (both done).
4. **CORS** — `functions/src/http/cors.js` lists the dev site origins (done).

## Security rules, TTL and other console settings

The Firestore and Storage rules are **not in this repo**: they are shared by every app of the suite and
published in the console (or through the Rules API). The assistant depends on one block of the Firestore
rules: `chatConversations` and `chatUsers` of both apps are closed to browsers (`isServerOnly`), because
conversation history and personal shortcuts go only through the `history` function. Change those rules only
with an emulator test first, and keep the previous ruleset id to roll back.

TTL policies on `expiresAt` for the collection groups `chatConversations` and `chatMessages` delete
history after the retention chosen in the Storico tab; they cover both apps.

## Rolling back

| What           | How                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Site           | Firebase console → Hosting → the site → release history → **Rollback** on the previous version |
| Functions      | push a revert commit to the branch (or redeploy the previous commit by hand, see above)        |
| Security rules | republish the previous ruleset from the console's Rules history                                |
| Branch         | `git revert` on the branch and push: the workflow redeploys; never force-push `production`     |

## After a deploy

- The run is green and the log shows `Deploy complete!`.
- The site loads and you can sign in; a database question gets an answer.
- For function changes: the functions are listed as `Successful update operation`, not `Skipped`.
- Firebase may warn about "cleaning up build images": harmless, at most a few cents a month.
