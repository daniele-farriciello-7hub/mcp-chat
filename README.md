# mcp-chat — 7hub assistant

Standalone app providing the AI assistant chat, **embedded** in the 7hub-revolution dashboard through an
iframe and deployed independently at **https://assistente-7hub.web.app** (Firebase project
`mappa-contatti-217007`, hosting target `app-corrente` → site `assistente-7hub`).

Next.js with `output: 'export'` (static site), Firebase Hosting, Firebase Auth, Firestore, Storage and
Firebase AI Logic (Gemini on Vertex AI). Server-side work lives in `functions/`.

## Run locally

Requires **Node 22** (Next 16 does not start on Node 18).

```bash
nvm use 22
npm install
npm run dev            # http://localhost:3001
```

| Route    | Purpose                                                                                    |
| -------- | ------------------------------------------------------------------------------------------ |
| `/`      | Standalone chat: sign in with suite accounts, requires `permessi_app['assistente-7hub']`   |
| `/embed` | **The route 7hub loads** in the iframe (sign-in required too; context comes from the host) |

To see it inside 7hub, also run the 7hub-revolution frontend (`localhost:3000`). The iframe address is in
`7hub-revolution/packages/frontend/app/scripts/components/ai-assistant/embed-config.ts`.

| Script                 | What it does                                   |
| ---------------------- | ---------------------------------------------- |
| `npm run build`        | static export into `out/`                      |
| `npm run lint`         | ESLint (`eslint-config-next`, core web vitals) |
| `npm run format`       | Prettier on the whole repo                     |
| `npm run format:check` | Prettier check, no writes                      |

## Project structure

Code is organised **by feature**. `app/` only contains routes; everything else lives in a feature or in
`shared/`.

```
src/
  app/                     routes only: layout, / (standalone), /embed
  features/
    auth/                  useSession, login screen, access denied
    chat/                  agent (Gemini streaming + tools), conversation state, voice input, chat UI
      tools/               tools the model can call (read_document, query_database) and their dispatcher
    documents/             archive schema, store, indexing + background queue, chat catalog, Documents tab
    database/              db connections schema/store, schema scan, card drafting, chat schema, Database tab
    drive/                 Drive OAuth, filename search, copy to Storage (disabled until the OAuth client exists)
    settings/              settings store and defaults, model list, settings panel
  shared/
    firebase/              app init, App Check, AI Logic, Firestore root paths, Cloud Functions calls
    embed/                 postMessage bridge with the host page
    ui/                    generic UI (Button, Field, Section, Slider, Switch)
functions/
  index.js                 Cloud Functions wiring only
  src/
    http/                  tools + database HTTP endpoints (shared CORS, token check, dispatch)
    auth/                  Keycloak token verification, Firebase ID token + app-permission checks
    clients/               Java services client
    tools/                 person registry tools, emulator-only diagnostics
    db/                    MariaDB/MySQL pool, schema introspection, SQL validation, credential encryption
    drive/                 Drive client, nightly index sync, job requests
  scripts/                 tests, smoke test, response inspection, schema migration
```

## Conventions

| What             | Rule                                                                               | Example                         |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------------------- |
| Language         | all names, comments and docs in English; UI text and model prompts in Italian      | `indexDocument`, «Indicizza»    |
| Folders          | lowercase, feature-based                                                           | `features/documents/components` |
| React components | PascalCase `.jsx`, one exported component per file                                 | `DocumentRow.jsx`               |
| Hooks            | `useX.js`                                                                          | `useSession.js`                 |
| Other modules    | camelCase `.js`, named after what they contain                                     | `indexingQueue.js`              |
| Node scripts     | kebab-case `.mjs`, tests end in `.test.mjs`                                        | `index-diff.test.mjs`           |
| Functions        | verb + object                                                                      | `enqueueForIndexing`            |
| Constants        | UPPER_SNAKE_CASE                                                                   | `MAX_FILE_SIZE_BYTES`           |
| Imports          | `@/` alias across features, relative only inside the same feature; no barrel files |                                 |
| Firestore values | status strings and paths are defined once in `features/documents/schema.js`        |                                 |
| Style            | Prettier (`.prettierrc.json`) + ESLint, both must pass                             |                                 |

Names that are **not** ours and stay as they are: `users/{uid}` fields owned by userconf (`permessi_app`,
`isActive`, `nome`), the app id `assistente-7hub`, jsoggetto request/response fields, and the hosting URL.

## Data layout

```
apps/assistente-7hub/documents/{id}       document metadata, indexingStatus (pending|done|failed), indexCard
apps/assistente-7hub/driveFolders/{id}    Drive folders, written by the nightly sync
apps/assistente-7hub/drive/status         last Drive sync outcome
apps/assistente-7hub/jobRequests/{id}     work requested from the server (sync, copy)
apps/assistente-7hub/config/settings      chatModel, indexingModel, instructions, historyLimit, shortcuts…
apps/assistente-7hub/dbConnections/{id}   database connection config (host, port, user…), never the password
  /tables/{t}                             per table: columns, keys, enabled, card { summary, columns }
apps/assistente-7hub/dbSecrets/{id}       encrypted database password — denied to clients by security rules
Storage assistente-7hub/documents/{id}/…  file bytes read by Gemini
```

## How it talks to 7hub

The iframe is on another origin: it can neither read 7hub cookies nor navigate the parent page. Everything
goes through `postMessage` with verified origins (`src/shared/embed/hostBridge.js`).

| Direction   | Message                                  | Meaning                            |
| ----------- | ---------------------------------------- | ---------------------------------- |
| 7hub → chat | `{ type: 'context', user, page, theme }` | who the user is and where they are |
| chat → 7hub | `{ type: 'ready', releasedAt }`          | loaded, send the context           |
| chat → 7hub | `{ type: 'navigate', url }`              | go to this page                    |
| chat → 7hub | `{ type: 'close' }`                      | close the panel                    |

Outgoing messages also carry the legacy Italian `tipo` key, and legacy incoming context is normalised, until
7hub-revolution with the English protocol is in production (blocks marked `LEGACY` in `hostBridge.js` and
`app/embed/layout.jsx`). Who may embed the chat is decided in two places to keep aligned:
`TRUSTED_DOMAIN` in `hostBridge.js` and the `frame-ancestors` header in `firebase.json`.

## Chat and documents

- The chat model, instructions, temperature and history limit come from settings (admin panel).
- On every message the assistant receives the list of indexed documents (name + index card) and can call
  `read_document` to open one in full; the file goes back to Gemini as `fileData` inside the
  `functionResponse`.
- Indexing runs in the browser with the **indexing model** chosen in settings and no output token limit, in
  a background queue that keeps running when the settings panel is closed.
- Document names are unique (case-insensitive): an upload with an existing name is rejected, unless the
  only copy is a Drive file that cannot be indexed yet. Indexed documents can be deleted (Firestore entry
  and Storage copy).
- Gemini overload and rate-limit errors (503/429) are retried with backoff, in indexing and in chat. Failed
  documents keep the raw error on the document and show a one-line explanation in the panel.

## Chat and databases

- Admins register MariaDB/MySQL connections in the Database tab, read the schema with `INFORMATION_SCHEMA`,
  and choose which tables the assistant may see — everything starts **disabled**: a wide schema sent on
  every message is real cost and real exposure, so turning a table on is deliberate. Several connections can
  be enabled at once; the model sees the tables of all of them and picks the right one.
- Each enabled table gets a short card (summary + per-column description), drafted by Gemini from the
  schema (and, opt-in per connection, a few sample rows) and reviewed/edited by the admin — same shape as
  document index cards.
- The assistant queries an enabled connection with `query_database`, one read-only `SELECT`/`WITH` per call.
  The query is re-validated server-side against the tables actually enabled for that connection (the
  enabled list is the allowlist, not a hint) — see `functions/src/db/validateSelect.js`. This is a safety
  net, not the real boundary: the database user configured here should have **`SELECT`-only** access.
- The database password is never stored where a client can read it: it is encrypted (AES-256-GCM,
  `functions/src/db/credentials.js`) and kept in `dbSecrets/{id}`, a collection the security rules must deny
  to every client (see Prerequisites below).

## Back-end (functions/)

Operations that need 7hub data run as Cloud Functions in the same Firebase project, **deployed separately**.
The operator's Keycloak token is forwarded to the Java services as is (same model as `7hub-cqs`), so ACLs
and the sales hierarchy keep applying. **The environment comes from the token issuer**, not configuration.
Writes to production are blocked unless `ALLOW_PRODUCTION_WRITES=true`.

| Export              | Trigger                             | Purpose                                                                                        |
| ------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `tools`             | HTTP `POST /tools/<name>`           | `search-person`, `person-details`                                                              |
| `database`          | HTTP `POST /database/<action>`      | connection test/save/delete/scan/sample (admin-only) and `query` (any operator — used by chat) |
| `syncDrive`         | schedule, 03:00 Europe/Rome         | nightly Drive → Firestore index sync                                                           |
| `processJobRequest` | Firestore create `jobRequests/{id}` | "sync now" and Drive file copies                                                               |

`database` verifies the caller's **Firebase ID token** (`functions/src/auth/firebaseUser.js`) against
`users/{uid}` — unlike `tools`, a database connection has no per-operator ACL of its own, so this is the
only gate. It needs `DB_CRED_KEY` (32 random bytes, base64) in the function's environment to encrypt/decrypt
stored passwords: copy `functions/.env.example` to `functions/.env` for the emulator.

```bash
cd functions && npm install
npm test               # sync diff + schema migration mapping tests
npm run serve          # emulator on :5001
npm run smoke-test     # endpoint checks; set TOKEN_7HUB for real jsoggetto calls
```

`TOKEN_7HUB` comes from the `auth_data.token` cookie on 7hub (staging) and is passed only as an environment
variable, never written to a file. The diagnostic tool `person-response-shape`
(`scripts/inspect-response-keys.mjs`) exists only in the emulator.

Still missing: Firebase ID token verification on `tools` (defence in depth), and the decision on how the
chat obtains the operator's Keycloak token.

## Deploy

```bash
nvm use 22 && npm run build && firebase deploy --only hosting
```

`build` and `deploy` are separate: deploying without building publishes the previous build silently.
Functions are deployed with `firebase deploy --only functions` (currently blocked on IAM grants that require
the project owner).

### Release order for the English schema

The rename of Firestore/Storage paths, fields and the host protocol needs this order, each step confirmed:

1. Update Firestore and Storage security rules for `documents`, `driveFolders`, `jobRequests` (the rules
   are managed outside this repo).
2. `cd functions && npm run migrate` (dry run, read-only) — check the counts, then `npm run migrate -- --apply`.
3. Deploy mcp-chat hosting (it speaks both host protocols).
4. Deploy 7hub-revolution with the English `assistant-embed.tsx`.
5. Verify, then `npm run migrate -- --cleanup` to delete the Italian-schema data.
6. Remove the `LEGACY` blocks and deploy mcp-chat again.

### If the site name changes

| Where                                        | What                                         |
| -------------------------------------------- | -------------------------------------------- |
| `.firebaserc`                                | hosting target                               |
| `functions/src/http/toolsEndpoint.js`        | `ALLOWED_ORIGINS`                            |
| 7hub `embed-config.ts`                       | iframe address                               |
| Console: Authentication → Authorised domains | Google sign-in fails without the domain      |
| Console: reCAPTCHA key `assistente-7hub`     | App Check does not attest without the domain |

## Open items

1. **Actions on 7hub** (create applications, search customers): the jsoggetto code in `functions/` is
   written and tested; how the chat obtains the operator token is still undecided.
2. **App Check enforcement** is in monitoring mode only; it becomes mandatory for AI Logic on 2 November 2026.
3. **Drive search and sync** stay disabled until the OAuth client (`features/drive/driveConfig.js`) and the
   functions IAM grants exist.
4. **`dbSecrets/{id}` needs a security rule denying it to every client** (rules are managed outside this
   repo — see "Release order" above for how that gets applied). Until then the AES-GCM encryption in
   `functions/src/db/credentials.js` is the only thing between an operator and a stored database password.
5. **`query_database` has no per-operator ACL**: any signed-in operator who may use the chat can read
   whatever is enabled, unlike the Java tools where the forwarded Keycloak token keeps ACLs and the sales
   hierarchy applying. Confirm this is acceptable for whatever ends up enabled before relying on it.
6. **The database user should be `SELECT`-only.** SQL validation (`functions/src/db/validateSelect.js`) is a
   safety net, not the boundary — ask for a read-only grant scoped to the one database before go-live.
# mcp-chat
