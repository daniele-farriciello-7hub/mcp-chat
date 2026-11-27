# mcp-chat — 7hub assistant

Standalone app providing the AI assistant chat, **embedded** in the 7hub-revolution dashboard through an
iframe and deployed independently (Firebase project `mappa-contatti-217007`):

| Environment | Branch        | Site                                        |
| ----------- | ------------- | ------------------------------------------- |
| Production  | `production`  | https://assistente-7hub.web.app             |
| Development | `development` | https://assistente-7hub-development.web.app |

How environments, releases and deploys work: **[DEPLOY.md](DEPLOY.md)**.

Next.js with `output: 'export'` (static site), Firebase Hosting, Firebase Auth, Firestore, Storage and
Firebase AI Logic (Gemini on Vertex AI). Server-side work lives in `functions/`.

## Run locally

Requires **Node 22** (Next 16 does not start on Node 18).

```bash
nvm use 22
npm install
npm run dev            # http://localhost:3001, as the development app
```

`npm run dev` runs as the **development** app (`.env.development`), which needs the
`assistente-7hub-development` permission. `NEXT_PUBLIC_APP_ENV=production npm run dev` runs against production
data instead — see [DEPLOY.md](DEPLOY.md#running-locally).

| Route    | Purpose                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| `/`      | Standalone chat, with a sidebar: sign in with suite accounts, requires `permessi_app[<app id>]`                 |
| `/embed` | **The route 7hub loads** in the iframe (sign-in required too; context comes from the host; sidebar as a drawer) |

To see it inside 7hub, also run the 7hub-revolution frontend (`localhost:3000`). The iframe address is in
`7hub-revolution/packages/frontend/app/scripts/components/ai-assistant/embed-config.ts`: on `localhost` it is the development twin unless
`VITE_ASSISTANT_ORIGIN=http://localhost:3001` is set (a git-ignored `7hub-revolution/.env.local`, then restart Vite) or, per browser,
`localStorage['7hub:assistant-origin']` is `http://localhost:3001`; production hosts always use production.

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
      tools/               tools the model can call and their dispatcher (see "Model tools" below)
      commands/            commands without AI (settings.noAiCommands): trigger matching, format registry, runner, composers
      documentLists/       lists of documents without AI (settings.noAiDocumentLists): settings, trigger matching, selection, reply
    charts/                charts drawn in the chat: data helpers and the SVG component
    history/               conversation history client, Storico tab (admin)
    shortcuts/             personal shortcuts and their admin views
    navigation/            the sidebar of both pages: frame (rail, drawer), entries, account menu — see "Sidebar" below
    documents/             archive schema, store, indexing + background queue, modes and categories, archive search, chat catalog, Documents tab
    database/              db connections schema/store, schema scan, card drafting, chat schema, Database tab
    drive/                 Google Drive sources: the "Drive" view of the Documents tab, `drive` function client
    settings/              settings store and defaults, model list, settings panel
  shared/
    environment.js         production or development: app id and function names (DEPLOY.md)
    firebase/              app init, App Check, AI Logic, Firestore root paths, Cloud Functions calls
    embed/                 postMessage bridge with the host page
    ui/                    generic UI (Button, Field, Section, Slider, Switch)
functions/
  index.js                 Cloud Functions wiring only (production functions and their development twins)
  src/
    appContext.js          which app a request works for (production / development)
    http/                  tools, database, history, drive and driveWebhook HTTP endpoints (shared CORS, token check, dispatch)
    history/               conversation history store (server side)
    shortcuts/             personal shortcuts store (server side)
    auth/                  Keycloak token verification, Firebase ID token + app-permission checks
    clients/               Java services client
    tools/                 person registry tools, emulator-only diagnostics
    db/                    MariaDB/MySQL pool, schema introspection, SQL validation, credential encryption, xlsx
    drive/                 Google Drive → archive sync: Drive client, listing, change plan, notification
                           channels, server-side indexing, source store, scheduler tick
  scripts/                 tests (also of browser modules from src/, loaded through support/src-alias.mjs), smoke test, response inspection, schema migration
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
`isActive`, `nome`), the app ids `assistente-7hub` / `assistente-7hub-development`, jsoggetto
request/response fields, and the hosting URLs.

## Data layout

Shown for production; development has the same layout under `apps/assistente-7hub-development` and
`Storage assistente-7hub-development/` (DEPLOY.md).

```
apps/assistente-7hub/documents/{id}       document metadata, source (upload|drive), indexingStatus (pending|done|failed), indexCard, description (images), mode (studied|archive), categories, categoriesManual; drive* fields for Drive files
apps/assistente-7hub/driveSources/{id}    a linked Drive folder or PDF: frequency, next/last run and result, lease, webhook state — server only
  /channels/{id}                          its Drive notification channels
apps/assistente-7hub/config/settings      chatModel, indexingModel, instructions, documentCategories, historyLimit, shortcuts, noAiCommands, noAiDocumentLists…
apps/assistente-7hub/dbConnections/{id}   database connection config (host, port, user…), never the password
  /tables/{t}                             per table: columns, keys, enabled, card { summary, columns }
apps/assistente-7hub/dbSecrets/{id}       encrypted database password
apps/assistente-7hub/chatConversations/{id}            conversation: who, when, counters, tokens, expiresAt
  /chatMessages/{id}                                    questions, replies, tool steps (no data rows)
apps/assistente-7hub/chatUsers/{uid}                   pointer to the user's open conversation
  /private/shortcuts                                    the user's personal shortcuts
Storage assistente-7hub/documents/{id}/…  file bytes read by Gemini (Drive files: id `drive-<driveFileId>`)
```

`chatConversations` and `chatUsers` are closed to browsers by the security rules: only the `history`
function reads and writes them. `driveSources` is handled the same way in code — only the `drive` function
(and the scheduler) touch it — and needs no rule change; closing it in the rules too is advisable (DEPLOY.md). TTL on `expiresAt` deletes history after the retention set in Storico; with "Mai" `expiresAt` is null and nothing is deleted.

## How it talks to 7hub

The iframe is on another origin: it can neither read 7hub cookies nor navigate the parent page. Everything
goes through `postMessage` with verified origins (`src/shared/embed/hostBridge.js`).

| Direction   | Message                                              | Meaning                                                                                                                                                                    |
| ----------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7hub → chat | `{ type: 'context', user, page, theme, appearance }` | who the user is and where they are, and how 7hub looks (`hostChrome`, `capabilities`: see below)                                                                           |
| 7hub → chat | `{ type: 'appearance', appearance }`                 | 7hub's look changed: applied live                                                                                                                                          |
| 7hub → chat | `{ type: 'toggle_sidebar' }`                         | 7hub's hamburger: open the sidebar drawer, or close it if it is open                                                                                                       |
| chat → 7hub | `{ type: 'ready', releasedAt }`                      | loaded, send the context                                                                                                                                                   |
| chat → 7hub | `{ type: 'navigate', url }`                          | go to this page                                                                                                                                                            |
| chat → 7hub | `{ type: 'close' }`                                  | close the panel                                                                                                                                                            |
| chat → 7hub | `{ type: 'sidebar', docked, open, place }`           | this build has its own sidebar; `docked`: beside the conversation (iframe ≥ 1024px) or a drawer; `open`: the drawer is open; `place`: `{ label, chat }`, where the chat is |
| chat → 7hub | `{ type: 'sidebar', available: false }`              | the sidebar is gone (signed out): 7hub drops its hamburger and gets its own menu entries back                                                                              |

## Sidebar

Both pages have a left sidebar (`src/features/navigation/`), in the look of 7hub's menu: `/` docks it from 768px up, `/embed` (the
panel inside 7hub) keeps it as a drawer and docks it only when the iframe is 1024px wide or more (see "Inside 7hub" below).
`ChatPanel` takes `sidebar` (and `embedded`) and wraps itself in `AppShell`; what the page shows is
the `place` in `ChatPanel`: `section` is `null` for the chat, otherwise a tab of the configuration (`SETTINGS_TABS` in
`features/settings/settingsSections.js`; `shortcuts` is also the panel of an operator who is not an admin: their own shortcuts)
and `sub` its subsection. The entries are buttons that switch it, not links: the app is a single static page.

| Where    | What                                                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top      | the assistant's mark (it morphs while a reply is written), the name with the status under it (Online, Sto scrivendo…), **Nuova chat** (reset; disabled mid-reply) |
| Everyone | **Chat**, **Le mie scorciatoie** (not for admins: their "Scorciatoie" is in Configurazione)                                                                       |
| Admin    | **Storico**; **Configurazione**: Modello IA, Scorciatoie, Documenti, Database, 7Hub (the tabs of `SettingsPanel`)                                                 |
| Bottom   | avatar, name and email; menu: **Impostazioni** (the appearance drawer below), **Esci**                                                                            |

The header lost what moved here (gear, configuration, logout) and, on `/` with the sidebar docked, its status line too: the page
has no header and starts at its top, and the status is in the sidebar's head (the same words as before; in the rail a dot on the mark,
with the words in its tooltip). On a phone the header stays, with the hamburger, the mark, the name, the status and the
new-conversation arrow; in `/embed` it also stays (with the status and the host's close button) wherever the host does not draw its own. Past conversations are **not** listed: the `history` function only hands an operator today's open conversation back
(`restore`); `list` / `transcript` are admin-only and cover everyone's, so a list of "your conversations" needs a new endpoint.

- **Docked** (768px and up on `/`): in the layout, 280px wide, or a 76px icon rail (the arrow on its edge; the choice is kept in
  `localStorage`, `mcp-chat:sidebar`); in the rail the labels stay for screen readers and a tooltip names each icon.
  **Otherwise**: an off-canvas drawer opened by the hamburger; it closes on Escape, on the backdrop and when an entry is
  chosen, the page behind is `inert` while it is open and the focus goes back to where it was.
- **Look** (`.app-sidebar` in `globals.css`, no state in the components): the page surface by default; with a "Temi
  coordinati" theme its gradient, vertical (`--accent-nav`), over the start colour, white text, and with "Sfondo animato"
  the two drifting reflections of 7hub's `NavGlow` (`.sb-glow`). "Stile menu" (`navStyle`): **Classico** is full height,
  flush with the edges; **Flottante** a rounded panel with a margin and a shadow (not on phones, as in 7hub).
- **Accessibility**: `aside` with a `nav` landmark, `aria-current="page"` on the current entry (and on the current
  subsection), `aria-expanded` on the collapse button, the groups, the hamburger and the account button, visible keyboard
  focus, arrow keys in the account menu and in the rail's flyout.

### Subsections

A configuration tab that is long, with clearly separate groups, is split into **subsections**: one sidebar entry each, one page
each, under a title and a line saying what it is. They are listed in `features/settings/settingsSections.js` (id, URL slug,
name, title, description) and the tab components take `subsection` and draw only that group (`inSubsection`). Without a sidebar
(nothing today: both pages have it) `subsection` is empty and every tab draws everything, as it always did.

| Tab                               | Subsections                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| Modello IA                        | Istruzioni · Modelli · Uso dei documenti · Risposte · Grafici · Memoria e trasparenza |
| Scorciatoie                       | Riquadri · Personali                                                                  |
| Documenti                         | Da indicizzare · Con errore · Indicizzati · Drive · Categorie · Documenti senza AI    |
| Database                          | Connessioni · Istruzioni e modello · Limiti · Comandi senza AI                        |
| Storico (under "Assistente")      | Panoramica · Conversazioni · Salvataggio                                              |
| 7Hub                              | Istruzioni · Strumenti                                                                |
| _Le mie scorciatoie_ (non-admins) | not split: a single list                                                              |

- **The sidebar** (`NavGroup.jsx`): an entry with subsections is a group with a chevron (`aria-expanded`); its subsections sit
  under it, indented along a line with an elbow to each (7hub's vertical nav), and the list opens with an animated height.
  Clicking a closed group opens it and, if the page is not already inside it, goes to its first subsection; clicking an open
  one closes it. The current subsection has `aria-current="page"`, its group is tinted (`data-has-current`). A group the
  operator never opened or closed by hand follows the page (open while the page is inside it); the ones opened or closed by
  hand are remembered (`localStorage`, `mcp-chat:sidebar-groups`) until the page goes into a closed one again.
  In the **icon rail** a group is only its icon: hovering or focusing it shows a flyout with the subsections, a click keeps
  it open, Escape or a click outside closes it, arrow keys move through it (the flyout is drawn in the body, so Tab
  leaves it). In the **drawer** the groups open inline; choosing a subsection closes the drawer, opening a group does not.
- **Where it is a drawer** (phones, the 400px panel in 7hub): the strip of tabs is gone; a selector under the header (`SectionSelect`) lists every tab as a group and its
  subsections as options, so everything stays reachable without opening the drawer.
- **State and saving**: `SettingsPanel` keeps the shared settings object whatever is shown, so what was typed in one subsection
  is still there in the next, and the one "Salva" saves all of it (Documenti saves on its own; Database and Storico mix both,
  as before). The tab components stay mounted while the subsection changes (Documenti's filters, a conversation open in
  Storico, the shortcut being edited).
- **Unsaved edits**: leaving the configuration for another tab, the chat or a new chat with edits not saved opens "Hai modifiche
  non salvate" (`UnsavedChangesDialog`): **Annulla** (also Escape, or a click outside) stays, **Esci senza salvare** goes on
  and drops the edits. Moving between the subsections of one tab never asks. The browser also asks before closing or
  reloading the page while edits are unsaved.
- **URL** (`placeUrl.js`): the place is in the hash, so a refresh or a shared link comes back to it and the back button walks
  through the places: `#config/modello/istruzioni`, `#config/documenti/drive`, `#storico/conversazioni`,
  `#le-mie-scorciatoie` (non-admins); no hash is the chat. A hash that names nothing (or a tab the operator cannot see) is
  the chat; a tab without its subsection opens the first. `/embed` never touches the URL (its place is state only).

### Inside 7hub (`/embed`)

The same sidebar, as a guest:

- **Hamburger**: 7hub draws the header of the panel (`hostChrome`), so the hamburger is **7hub's own**, at the far left of its header,
  when the context declares `capabilities: { sidebarButton: true }` (read strictly, `true` only: `readHostCapabilities` in `hostBridge.js`):
  it sends `{ type: 'toggle_sidebar' }`, the chat opens or closes the drawer and answers with the `sidebar` message (`open`), and the
  chat leaves out its own (no slim bar, none in the configuration pages' header). A host that does not declare it (an older 7hub)
  keeps the fallback: while the sidebar is a drawer the chat adds a slim bar under the host's header (`EmbedMenuBar`: hamburger and
  the place's name), the configuration pages have the hamburger in their own header, and without `hostChrome` it is in the chat
  header. The drawer behaves as above (Escape, backdrop, a choice close it; the page behind is `inert`). **Focus**: opened by a
  hamburger of the chat, it goes back to that button on closing; opened by the host's, the focus goes to the drawer's first control
  (its close button) and, on closing, stays where it is when the host's button closed it (that button is in the host's document, which
  the chat cannot focus), or goes to the page when it closed from inside (Escape, backdrop, a choice, the close button). The command
  is ignored while the sidebar is docked and while nobody is signed in (never kept for later).
- **Docked** when the iframe is **1024px wide or more** (a media query on the iframe's own width, `AppShell`): there is no
  hamburger bar then, the sidebar sits beside the conversation and can collapse to the rail. The choices are kept apart from the
  standalone page's (`mcp-chat:embed-sidebar`, `mcp-chat:embed-sidebar-groups`). 7hub's panel is 400px today, so the drawer is
  what it shows; the docked layout is for a wider panel.
- **No URL**: the place is state; the hash is never read or written. 7hub's `open_settings`, `reset` and `ask` commands go through
  the same navigation, so they ask before dropping unsaved configuration edits.
- **Account**: name and email, and only **Esci** (the iframe has its own sign-in); no **Impostazioni**, because the look is 7hub's: the
  sidebar takes its colours from the `appearance` it sends (the coordinated menu theme and the primary colour, light or dark) like the rest of
  the chat. "Stile menu" does not exist there: always Classico.
- **Host**: the chat sends `{ type: 'sidebar', docked, open, place: { label, chat } }` at start-up and on every change; 7hub uses it to
  stop offering in its "⋮" menu the entries that now live in the sidebar ("Impostazioni e scorciatoie", "Esci dall'assistente") — an
  older chat build never sends it, and then they stay — to show its hamburger (while `docked` is false; `aria-expanded` is `open`) and,
  when the chat is not in the conversation (`place.chat` false), to write `place.label` ("Modello IA › Istruzioni")
  under the panel's title instead of "Contesto: …". A `{ type: 'sidebar', available: false }` takes it all back (sign-out). Every field is
  validated by 7hub (booleans strictly, `label` a string of at most 80 characters shown as text).

## Appearance (light/dark, colours, font size)

Inside 7hub the chat follows 7hub's settings drawer; opened on its own it has the same drawer, opened by the gear in
the header (on the login screen) or by **Impostazioni** in the sidebar's account menu (red dot when something is not
default): "Modalità" (Chiaro / Scuro, plus Sistema), "Stile menu" (Classico / Flottante), "Temi coordinati"
(the gradient of the sidebar and of the strip across the top, plus "Sfondo animato"), "Colore principale" (the 12 presets) and
"Font" (12-20 px), with a reset for each card and "Ripristina tutto". The options and their ids are 7hub's own
(`src/shared/appearance/palettes.js`, `navGradients.js`, `settingsConfig.js`), so a stored setting and a host
message mean the same thing. The choice is saved in `localStorage` (`mcp-chat:appearance`:
`{ mode, primaryColor, navColor, navAnimated, navStyle, fontSize }`; values saved by the first version of the menu, which
had an `accent` key, are mapped to the preset with the same colour). The host sends `appearance` in the
`context` and again, live, in `{ type: 'appearance', appearance }` whenever a setting changes:

```
appearance = { version: 1, mode: 'light'|'dark',
               primary: { main, light, dark, contrastText },            // hex
               accent: { start, stops: [{ color, at }], glow, glowAt, animated } | null,   // coordinated menu theme
               fontSize: 10..24 }                                       // px, 7hub's base is 13
```

or, for any of these, 7hub's ids instead of the resolved values: `primaryColor` (`'default'`, `'preset1'`…`'preset11'`),
`navColor` (`'default'` or a "Temi coordinati" id) and `navAnimated`. Resolved values win over an id.

Every key is optional and validated (`src/shared/appearance/validate.js`): known keys and ids only, hex colours only, no CSS
string is ever taken from a message (the gradient is rebuilt from the validated stops). The values are written on
`<html>` as a `data-theme` attribute and `--accent*` / `--fs-scale` variables (`apply.js`); `globals.css` turns them
into the design tokens (`bg-panel`, `bg-surface`, `text-ink`, `brand-*`, `text-fs-*`), so components never use a fixed
white or hex colour and need no `dark:` variants. Embedded, the drawer and its gear are hidden: the host's settings win.

Outgoing messages also carry the legacy Italian `tipo` key, and legacy incoming context is normalised, until
7hub-revolution with the English protocol is in production (blocks marked `LEGACY` in `hostBridge.js` and
`app/embed/layout.jsx`). Who may embed the chat is decided in two places to keep aligned:
`TRUSTED_DOMAIN` in `hostBridge.js` and the `frame-ancestors` header in `firebase.json`.

## Chat and documents

- The chat model, instructions, temperature and history limit come from settings (admin panel).
- On every message the assistant receives the list of indexed documents to study (name + index card + categories;
  the archive-only ones are not in it, see "Studied documents and archive files" below) and can call
  `read_document` to open one in full; the file goes back to Gemini as `fileData` inside the
  `functionResponse`.
- Indexing runs in the browser with the **indexing model** chosen in settings and no output token limit, in
  a background queue that keeps running when the settings panel is closed.
- Document names are unique (case-insensitive): an upload with an existing name is rejected, unless the
  only copy is a Drive file that cannot be indexed yet. Indexed documents can be deleted (Firestore entry
  and Storage copy).
- Gemini overload and rate-limit errors (503/429) are retried with backoff, in indexing and in chat. Failed
  documents keep the raw error on the document and show a one-line explanation in the panel. In chat a
  429 is waited out longer (up to ~18 s, with jitter); if it persists the turn moves, silently and once, to
  a fallback model (`fallbackModelFor` in `features/settings/models.js`: Flash-Lite, or Flash when Flash-Lite
  is the one limited). History records `fallbackFrom` on that reply, and `errorDetail` (the technical cause,
  admins only) on a failed one.
- **Google Drive** (Documents → Drive): the admin shares a folder or a PDF with the functions' service account
  (the address is shown in the panel, with a copy button), pastes its link and picks how often to sync.
  See "Google Drive sync" below.
- **Images** (PNG, JPEG, WebP, GIF, SVG, up to 20 MB) go in the same archive. Gemini reads PNG, JPEG and WebP
  as they are; an SVG is sent as the XML text it is (`indexMimeType: text/plain`, `mimeType` stays
  `image/svg+xml` so it previews and downloads as an image); a GIF cannot be given to Gemini at all, so its
  card is written from the name and the description alone (`indexMimeType: null`).
- Each image has a free-text **description** ("Logo WeUnit, versione bianca su sfondo trasparente"), written
  by the admin on the image's row in the pending list right after the upload (and edited later in the
  indexed list). It is **mandatory**: an image without one cannot be indexed (`getIndexingBlocker` returns
  "Descrizione mancante", and every path respects it: the row, the bulk selection, the queue and
  `indexDocument`, which re-reads the description from Firestore right before calling Gemini and refuses if
  it is empty). The field is shown right on each pending image row, marked "obbligatoria" and in a gentle
  amber while empty. The upload summary is only a list of file names with their status: there, "Indicizza"
  stays greyed out while some just-uploaded image has no description and says so ("Scrivi qui sotto la
  descrizione di 2 immagini per indicizzarle"); clicking either the message or the button switches to
  "Da indicizzare" (clearing the name and type filters if they hide the row), scrolls to the first of those
  images without a description and focuses its field. In a bulk selection those images stay selectable (to
  delete them) but are skipped by indexing, and the selection bar says how many and why. The buttons react
  to the text typed in the fields, not to the save that follows it, and pressing one first writes any unsaved
  text (`useTypedDescriptions`).
- The description is saved by itself (a moment after typing stops, on blur, and when the field goes away). On
  an **indexed** image it cannot be emptied: an empty field is not saved, says "La descrizione è obbligatoria"
  and goes back to the saved text. An image indexed before the rule existed and still without a description
  shows the field with the amber warning (and its re-index button is disabled until one is written). The
  description goes into the indexing prompt as the authoritative word on what the image is, and into the chat
  catalog directly: editing it on an indexed image needs no re-index (`updateDocumentDescription` only drops
  the cached catalog), the "Aggiorna anche la scheda" button is there for when the card should follow.

### Studied documents and archive files

Every document is one of two kinds (`mode` on the document, `features/documents/archiveMode.js`; a document
without it is a studied one, so everything uploaded before keeps working):

|                      | **Studia** (`studied`)                                        | **Solo archivio** (`archive`)                                                                       |
| -------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| What Vale does       | reads the file and answers about its content                  | recognises the file and hands it over, never answers about its content                              |
| Index card           | full: summary, institutes, products, topics, keywords         | short (`indexCard.light`): 1–2 sentences, 5–10 keywords, institutes and products only if obvious    |
| Instructions         | the admin's (Configurazione → Modello IA → Uso dei documenti) | a dedicated short prompt, fixed in the code (no admin text, no attached guides)                     |
| In the system prompt | one line per document, on every turn                          | **never**: one line says that N archive files exist and how to search them                          |
| `read_document`      | opens the file                                                | refuses, with a message telling the model to say the file is available for download and to offer it |
| Found with           | the list in the prompt                                        | `search_archive`, then `offer_files` / `share_file`                                                 |

- **Choosing the mode.** Before uploading, the Documents tab asks "Studia" or "Solo archivio" (default: Studia);
  the choice applies to the files picked next. It is changed later per document: on the row of a file not yet
  indexed, in the open card of an indexed one, or on several at once (checkboxes + "Studia" / "Solo archivio"
  in the Indicizzati list). Studied → archive only changes the mode (the full card is more than the short one
  needs). Archive → studied on a document that has only the short card drops it to "pending" and queues the
  full card (`documentMode.js`); until it is written the chat does not read it.
- **Drive documents** are studied by default and changed the same way, from the browser. This is a plain
  `updateDoc` of `mode`, `categories` and `categoriesManual`: the Drive sync (`functions/src/drive/syncSource.js`)
  updates only the fields it names, so it never writes or clears them (a test in
  `functions/scripts/archive-indexer.test.mjs` covers the server indexer; the browser already updates Drive
  documents, to retry a failed card). No new action of the `drive` function was needed. When the sync does
  re-index a Drive document (content changed, "Reindicizza tutto"), the server reads the stored `mode` and
  `categoriesManual` right before the call and writes the right card.
- **The rule for the model** (`ARCHIVE_RULES` in `chat/systemPrompt.js`, not editable like `FILE_SHARING_RULES`):
  archive files are for finding and delivering; never answer about their content, say the file is available
  and offer it.
- **Chat plumbing**: `getChatCatalog` returns every indexed document with its `mode` and visible categories;
  `buildSystemInstruction` lists only the studied ones (`catalogBlock`), `agent.js` offers `read_document`
  only when there are studied documents and `search_archive` whenever there is any document (it searches all of
  them, see below), and passes the whole catalog to `share_file` / `offer_files`, which therefore accept archive
  ids. Each catalog entry also carries `date` (see "Listings" below).

### Categories

A fixed list of names kept by the admins, `documentCategories` in the settings (Configurazione → Documenti →
**Categorie**: add, rename, remove, reorder; every change is saved at once, like the rest of the Documents
tab). Seed: Mutuo, Cessione del quinto, Prestito, Policy banca, Modulistica, Contratti, Procedure interne,
Marketing. `features/documents/categories.js` is the single place that decides what a category is.

- **Assignment**: at indexing (both kinds, uploads in the browser and Drive on the server) Gemini picks 1–3
  categories **from the list only**: the schema's `enum`, the prompt and, last, `pickCategories` (which drops any
  name not in the list, spelled as in the list) all enforce it. Stored as `categories` on the document.
  `functions/src/drive/indexCard.js` keeps copies (`pickCategories`, `categoryUpdate`, the schema pieces, the
  default list); `functions/scripts/archive-categories.test.mjs` runs both over the same cases and compares the
  source text of the pieces that are prompt or schema.
- **Manual corrections**: in the open card of an indexed document the admin switches categories on and off
  (at most 3). That writes `categoriesManual: true`: from then on indexing neither asks for nor writes
  `categories` on that document (`categoryUpdate`). "Lascia scegliere a Gemini" gives it back.
- **"Classifica"** (`classifyCategories.js`, buttons in Categorie and above the Indicizzati list): for indexed
  documents with no category left in the list and not set by hand it makes one short call per document (3 at a
  time) with the indexing model, from the card already written (no file is read), and writes **only**
  `categories`. It runs in the browser for uploaded and Drive documents alike, which is why no server action is
  needed: the sync never touches that field. Above the Indicizzati list it works on what the filters show, so a
  few documents can be classified without touching the rest (type part of the name first).
- **Removing a category** from the list leaves the name written on the documents but unseen: the panel, the
  filters, the chat and the search all go through `visibleCategories`, and "Classifica" counts such a document
  as having none. Putting the name back brings it back. **Renaming** is different: the documents that carry the
  old name are updated to the new one (`renameCategoryOnDocuments`).
- **Where they show**: pills on every indexed row, a category filter and a mode filter (Studiati / Archivio /
  Tutti) next to the name filter on every list, `Categorie: …` on the catalog line of a studied document, the
  `category` argument of `search_archive`. Permissions or profiles by category are not part of this: the field
  is just kept clean for that.

## Google Drive sync

Documents → **Drive** links Drive folders (sub-folders included) and single PDFs to the archive. The server
does everything: the browser only configures it, through the `drive` function, and watches the state by
polling it.

- **Access** is by sharing: the functions read Drive as their runtime service account (Application Default
  Credentials, scope `drive.readonly`, no OAuth screen). One-time setup — enabling the Drive API, roles,
  sharing — in [DEPLOY.md](DEPLOY.md#google-drive-sync-set-up-once).
- **Only PDFs** (`application/pdf`), up to 20 MB (the archive's limit): Google Docs, shortcuts and anything else
  are ignored, an oversized PDF is listed as "saltato" with the reason.
- **A source** has its own frequency: every 15 minutes, hourly, every 6 hours, daily or weekly at a chosen hour
  (Rome time), or manual only. The scheduler (`driveScheduler`, every 15 minutes) runs the sources that are due.
  "Sincronizza ora" runs one at once and answers when done; "Reindicizza tutto" also rewrites every card.
- **What a run does**: lists the source's PDFs (metadata), compares Drive's checksum/version/modified time with
  what each document stored (`driveMd5`, `driveVersion`, `driveModifiedTime`), and downloads and indexes only
  the new or changed files. A rename alone updates the name without a new download or card. Indexing is done by
  the server with Gemini on Vertex, with the same model, instructions, attachments, schema and prompt as the
  browser (`functions/src/drive/indexCard.js` is a copy of `features/documents/indexing.js`: keep them
  identical; a test fails if they drift) and the same fields on the document.
- **Mode and categories** of a Drive document (studied / archive only, categories and their manual flag) are set
  from the browser and survive every sync: the run updates only the fields it names. See "Studied documents and
  archive files" above.
- **Removal**: a file deleted from Drive, or no longer inside any linked source, leaves the archive (Firestore
  entry and Storage file) at the next run, and the chat catalog follows. A file reachable from two sources is
  one document (`driveSourceIds`) and goes only when none holds it. A source that cannot be read in full (a
  sub-folder refuses access) removes nothing that run. Unlinking a source removes its documents.
- **Names are unique**: a Drive PDF whose name an uploaded document already has is not imported ("esiste già
  un documento caricato con questo nome"), never overwriting it. Drive documents cannot be deleted or replaced
  from the browser (they would come back); they carry a Drive icon with a link to the file.
- **Webhooks speed it up, polling is the guarantee.** Each source registers Drive notification channels
  (`files.watch`) on its folders; a notification marks the source due and the next tick syncs it (the webhook
  never syncs inline). A folder notification fires for files added or removed, not for edits inside a file:
  the version comparison, which runs at every scheduled time whether or not a webhook is active, finds those.
  Channels are renewed by the scheduler, stopped when a source is removed; if Google refuses to register one,
  the reason is stored and shown and the source runs on polling alone.
- **A run is bounded** (about 7 minutes) and resumable: what it cannot finish stays due, and the next tick
  continues. A lease on the source (transactional) keeps two runs from working on it at once.

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

## Model tools

The model never calls an API itself: it returns a `functionCall` (name + JSON arguments), `chat/agent.js`
runs the matching handler in `chat/tools/`, and the result goes back as a `functionResponse`, up to the
"giri" limit in settings.

| Tool              | What it does                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `read_document`   | opens an indexed document in full                                                                              |
| `search_archive`  | finds documents (any mode) by words and category, best match or most recent first: 10 by default, up to 50     |
| `share_file`      | shows an archive file (logo, image, PDF…) with a preview and a "Scarica" button                                |
| `offer_files`     | 1–6 files (up to 50 when a number is asked for): to pick from (several match, none matches exactly) or to list |
| `ask_options`     | 2–5 clickable answers to an ambiguous question — see "Clarifying questions" below                              |
| `describe_table`  | columns and card of one enabled table                                                                          |
| `query_database`  | one read-only `SELECT`, rows go back to the model (capped by the admin)                                        |
| `export_database` | the model writes the query; the server builds the .xlsx on click, up to the admin's row limit                  |
| `export_excel`    | a table the model already has (e.g. from documents) as .xlsx                                                   |
| `show_chart`      | a chart drawn by the app — see below                                                                           |

Every tool shows the operator an activity card in plain language ("Sto leggendo…", "Dati letti", "File
pronto"), never the tool name or its arguments; admins also see the SQL that ran. A tool that fails still
answers the model with the reason, so it can correct itself instead of losing the round
(`chat/tools/runToolCalls.js`). Admin limits for the round count: Configurazione → Modello IA → "Quante volte
può aprire documenti o interrogare il database" (default 6 giri).

### `read_document` — open a document

- The model always receives the list of indexed **studied** documents with their index cards; it opens one in
  full only when the card is not enough. An archive file (`mode: 'archive'`) is refused: the answer says it can
  be offered or delivered but is not read to answer, and tells the model to say so in a line and offer it. The
  check is made on the cached catalog and again on the stored document (so a file switched to archive a
  minute ago is refused too).
- The file goes back to Gemini as `fileData` inside the `functionResponse`: the model reads the original
  (PDF, Word…), not an extracted text. Only ids from the list are accepted.
- The same document opened twice in one answer shows one card. No admin limit: the cost is the document size.

### `search_archive` — find files and build listings

- The archive files are not in the system prompt (only their count, and how to search). The arguments are `query`,
  `category`, `sort` and `limit`: free text and/or a category of the admins' list (the argument is an enum of it),
  `sort` `relevance` (default) or `recent`, `limit` how many files come back. It runs in the browser over the catalog
  the chat already loaded (`documents/searchArchive.js`): text folded for capitals, accents and punctuation, filler
  words dropped, a crude Italian stem ("mutuo" finds "mutui"), then a score per query word by where it is found — file name 5,
  keywords / categories / institutes / products 3, description and card text 1 — plus a bonus when every word is
  found and one when the words appear in a row in the name. No embeddings, no server. It answers with `ok`,
  `total`, `shown`, `sorted`, `files` (each `id`, `name`, `description`, `categories`, `mode` and `date` when it has
  one) and a `note`. `query` may be empty with a category, which lists the category, or with `sort: "recent"`,
  which is the whole archive newest first; an unknown category is answered with the list.
- **Every indexed document is searched, studied ones too** (each result says its `mode`). It used to be archive
  files only, but a listing is not a job for the model reading the system prompt's list: asked for "the
  communications sent by Direzione, most recent first", it composed the list from the prompt and dropped the newest
  ones (and `search_archive` was not even offered when there were no archive files). Here the filter, the order and
  the count are exact. Putting a date in every line of the prompt would cost tokens on every turn for something
  this tool answers on demand, so the prompt is unchanged.
- **Limits.** `limit` is 10 when not given, and at most 50 (`documents/listingLimits.js`: `DEFAULT_LISTING_FILES` 6,
  `MAX_LISTING_FILES` 50; anything that is not a number is the default). With `sort: "recent"` the same filter
  (words, category) applies and the matches are ordered from the most recent document, undated ones last, the score and
  then the name breaking ties.
- **The date of a document** (`documents/documentDate.js`, `documentDateMs`): a date written in the file name wins
  (ISO `2026-11-25`, also with `_` or `.`, or Italian `25-11-2026`, `25/11/2026`, `25.11.2026`; the first real calendar
  date, years 2000 to 2099, so a whole batch synced the same day still sorts by the day each file is from), else
  `driveModifiedTime` for a Drive document (the content's date; `createdAt` there is only when the sync first saw the
  file), else `createdAt` (an upload, or the new version of a replaced one), else `indexedAt`. A date in the name is
  noon UTC of that day, so it is shown as the same day in Rome. The catalog entry carries it in milliseconds
  (`date`); the model gets it as `date: 'YYYY-MM-DD'` in Rome time (absent when there is none), and so does an
  `offer_files` card (`documentDate`).
- The model then hands the files over with `offer_files` (several candidates, or a listing with
  `reason: "listing"`: the tool description says so for "che moduli ci sono per il mutuo?" and "le ultime 20
  comunicazioni") or `share_file` (one clear match). Both validate against the whole catalog.
- Activity rows, in plain Italian: "Cerco nell'archivio", then "N file trovati" / "Nessun file trovato".

### Listings: how many files

A listing is the operator asking what files exist (a category, a kind of file, "le ultime N"). The rules are in
`LISTING_RULES` (`chat/systemPrompt.js`, fixed like `FILE_SHARING_RULES`, present whenever there is any indexed
document): call `search_archive` (category, `sort: "recent"` for the latest ones, `limit`), show the result with
`offer_files` and `reason: "listing"`, all the ids in one call and in the order received. **How many**: 6 when neither
the operator's message nor the admin's instructions (the "Modello IA" prompt fields, e.g. «Come sceglie i
documenti»: "per le comunicazioni mostra le ultime 15") give a number; otherwise that number (the operator's wins
over the instructions'), at most 50. The model decides, the code enforces the cap: `offer_files` shows 50 at most
and tells the model if it cut the list (`capped`), the history store keeps the same 50
(`MAX_CHOICE_FILES`, compared with the browser's cap in `history-store.test.mjs`). The card
(`FileChoiceCard.jsx`) is the grid of thumbnails up to 8 files and, past that, a compact list (icon, name, date) in a
box that scrolls (`max-h-[22rem]`), with the count in the header; a listing also shows each file's date. A row does
not look the file up (fifty reads for a list mostly scrolled past): picking one gives the usual shared-file card.

### `share_file` — hand over a file

- For "mi dai il logo di WeUnit": the model finds the file in the catalog (or, for an archive file, with
  `search_archive`) by name, description and index card and calls `share_file` with its id; the operator gets a card with the image (or the file name) and a
  **Scarica** button. Any archive document works, not only images, and archive-only ones too. Only ids from the
  catalog are accepted;
  when several match the model uses `offer_files` instead of stacking cards (several `share_file` only if the
  operator asks for all of them, at most 4). `share_file` is called directly only when the request clearly names
  the file; an approximate match goes through `offer_files` with `no_exact_match`.
- The catalog marks images with `[immagine]` and states the admin's description before the index card. The
  rules for handing over a file are in `systemPrompt.js` (`FILE_SHARING_RULES`), not in the editable
  selection text, so they apply whatever the admin saved.
- The card (`SharedFileCard.jsx`) is rebuilt from the document id, so it survives a reload of the
  conversation. Download goes through `shared/downloadFile.js`: the bytes are fetched and saved as a blob
  under the original file name (a cross-origin `<a download>` would be ignored); if that fails, the file
  opens in a new tab.
- `read_document` still opens an image for the model to look at (not a GIF, which Gemini cannot see).

### Clarifying questions — `offer_files` and `ask_options`

When a request is ambiguous the assistant shows clickable choices instead of guessing or writing a wall of
text. Both tools end the model's turn: it writes at most one short sentence and waits.

- **`offer_files`** `{ question, ids[1–6, up to 50 for a listing], reason? }` — `reason` is `ambiguous` (default), `no_exact_match`
  (the header then reads "Non ho trovato esattamente quello che cerchi. Forse intendevi:") or `listing`: the
  operator asked what files exist ("che moduli ci sono per il mutuo?"), so `question` is the title of the list
  ("Moduli per il mutuo", "File disponibili" when empty) and the card has no "Nessuno di questi". A single id is
  a "did you mean this?": it is allowed as `no_exact_match` or `listing` (a category can hold one file), and
  with `ambiguous` the handler turns it into `no_exact_match`. The model uses it whenever the request only approximately matches a file (a typo, a partial
  name, a guessed abbreviation) instead of silently correcting it and calling `share_file`. Ids not in the
  catalog are dropped; with none left the model gets an error. `FileChoiceCard.jsx` shows the thumbnails
  (`PreviewImage`, a file icon for non-images); picking one is played out by the app as a normal exchange
  **without a model round trip** — at the end of the conversation, under the model's own line, a user bubble
  "Ho scelto <nome file>", then the usual `SharedFileCard` and "Ecco il file." — while the other thumbnails stay
  in view, dimmed. `useConversation.pickFile` stores that exchange like any turn (`recordQuestion` for the pick,
  `recordTurn` for the card and the line), so it comes back in order after a reload and the model sees it in its
  history. "Nessuno di questi" sends that text as a normal message. A reply shows at most one picker: the model is told
  to call `offer_files` once, with all the files, and if it calls it again the later card replaces the earlier one
  (the end payload carries a constant `replaceKey`, handled in `useConversation` like a redrawn chart: the earlier
  card leaves the chat and is never stored; the key itself is not stored either).
- **`ask_options`** `{ question, options[2–5], allow_other? }` — each option is a full answer the operator would
  type. `ChoiceCard.jsx` (same look as `OptionsCard`) sends the clicked option's text as the next user message
  through the normal send path. "Altro…" (unless `allow_other` is false) only focuses the message box.
- A card is _answered_ once any message follows it (clicked or typed): the pick is marked, the rest is off. The
  pick is stored as `selected` on the activity message: `useConversation.selectOption` (and `pickFile`, for files)
  updates the state and calls the `choice` action of the `history` function (`recordChoice` in `historyStore.js`),
  which accepts only something the card offered. Activity rows carry `kind` (`choice` | `file_choice`),
  `label` (the question), `choices` / `files`, `allowOther`, `reason`; all are allow-listed in
  `storableActivity`, so a restored conversation shows the cards again. The model sees a picked answer as the
  user's next message, and a picked file as the "Ho scelto …" / "Ecco il file." pair.
- The contract (when to ask, one question at most, never when the answer is the same) is fixed in
  `systemPrompt.js` (`CLARIFICATION_RULES`, `FILE_CLARIFICATION_RULES`). The admin sets, in Configurazione →
  Modello IA → "Domande di chiarimento", how often to ask (`clarificationFrequency`: rare / when_needed /
  often) and the ambiguities typical of the company (`clarificationInstructions`); both are appended after
  the fixed rules.

### `describe_table` — read a table's structure

- The system prompt carries only a short card per enabled table; the full column list (types, primary key,
  ENUM values, admin descriptions) comes from this tool, for the tables the model is about to query.
- No network call: the schema is already loaded for the conversation, so it is free and the model is told to
  use it rather than guess a column.

### `query_database` — read data to answer

- One read-only `SELECT`/`WITH` per call, run by the `database` function (`query` action). The server
  re-checks it (`functions/src/db/validateSelect.js`): one statement, enabled tables only, a `LIMIT` when missing and a
  timeout (`max_statement_time`) added on top.
- The rows go back to the model, which answers from them. Limits in Configurazione → Database → "Limiti delle
  query": righe massime per query (50–2000, default 500) and timeout (3 s–10 min, default 15 s). A truncated
  result carries a warning so the model never reports the cut count as the total. The timeout is enforced by the
  database (`max_statement_time`) and clamped to 600 s on the server; the `database` function lives 720 s so the
  database always stops the query first. A long query keeps the operator waiting and weighs on the customer's database.
- **Per-user connections** (`userScoped`): the server sets `@assistente_utente_email` to the operator's email
  on the same socket before the query and clears it after (`queryAsUser` in `functions/src/db/mysqlClient.js`);
  the customer's views filter on it. With "Richiedi email verificata" on, an unverified email is refused.

### `export_database` — Excel file of database rows

- For "give me the file": the model writes only the query and **never sees the rows**. The server (`exportPreview`)
  checks it with the same rules as `query_database` and answers with the row count, the columns and 3 sample
  rows; the model then says what the file contains.
- The card shows "Scarica Excel". On click the browser sends back the query (`exportFile`), the server runs it
  again **as the person clicking** (same per-user filter) and returns the .xlsx.
- Limits in Configurazione → Database → "Limiti degli export Excel": righe massime per file (1.000–200.000,
  default 50.000) and query time (10 s–10 min, default 45 s: one budget per request, split between the count and
  the sample at preview time, spent on the file at click time). They are read from settings **on the server**, never
  from the request; past the row limit the file is cut and the model is told to suggest a narrower request.
- The card survives a reload: history stores the query, never the rows (`storableExportQuery` in
  `functions/src/history/historyStore.js`).

### `export_excel` — Excel file of a table the model already has

- For data that does not come from a single query: a comparison built from documents, or a few rows already
  read with `query_database`. The model passes columns and rows; the browser builds a real .xlsx
  (`shared/xlsx.js`) — not a CSV, which Excel on an Italian locale opens in one column.
- Only when the operator asked for a file. Meant for small tables: every row is written by the model, so it
  costs output tokens. Its rows live only in the open page: after a reload the card is not restored.

## Commands without AI

Some questions always have the same answer shape and come from one fixed query: "erogato" (this year's and
this month's liquidated amount by product, with the comparison to the same days of last year, the monthly trend,
the territorial directors and the top banks) went through Gemini for 2–4 minutes. A **command without AI**
skips the model: **the server runs the query and the browser writes the answer**, in a few seconds, always with
live data. The admin manages them in Configurazione → Database → **Comandi senza AI**: a list where he adds,
edits, switches on or off and deletes commands. "Erogato" is just one of them, started from a preset.

- **A command** (`settings.noAiCommands`, an array; shape and defaults in
  `features/chat/commands/commandSettings.js`): `id` (generated, stable: shortcuts point to it), `name`,
  `enabled`, `triggers`, `connectionId`, `sql`, `format`, `title` / `intro` (for the `table` format), `maxRows`
  (default 10.000), `timeoutSeconds` (default 60, capped at 600 by the server) and `errorMessage` (empty = a
  default that names the command). It can be switched on only with a connection and a query (an empty SQL is
  a query for a format that has a default one: `erogato`).
- **When it runs.** The message is exactly one of a command's triggers: compared trimmed, lowercase, one space
  between words and without trailing punctuation (`Erogato?`, `erogato.`). Anything else (`erogato agos`,
  `erogato luglio 2026`) still goes to the model. The message is matched against **all the commands that are
  on** (`commandFor` in `features/chat/commands/matchCommand.js`). Two commands cannot share a trigger: the
  panel leaves out a word another command has (and says whose it is) and flags any clash that is already
  there; a list that has one still behaves the same every time, the first command of the list runs. The same goes
  across the two kinds: a word of a list of documents without AI (below) is refused here too.
- **Formats** (`features/chat/commands/formats.js`, matching `COMMAND_FORMATS` in
  `functions/src/db/commandFormats.js`: keep the two in step, `chat-commands.test.mjs` checks it). A format is
  how the rows become the answer. Browser side: a label, a summary for the panel, `hasDefaultSql` and
  `compose({ rows, columns, command })` returning markdown. Server side: the **column contract** (`columns`: the
  query must return them all, or the command fails and names the missing ones; empty = any) and `defaultSql`
  (what an empty SQL runs). Today: `erogato` (the report; `componiErogato` in `commands/erogato.js`, contract
  `EROGATO_COLUMNS`, default query `EROGATO_SQL`) and `table` (a markdown table of the rows with an optional
  title and intro, numbers in it-IT, dates as dd/mm/yyyy, the first 50 rows and a note with the total;
  `componiTabella` in `commands/tabella.js`, no contract). To add one: an entry on each side and a composer.
- **Presets.** "Aggiungi comando" offers "Da modello: Erogato" (name, triggers, `format: 'erogato'`, the default
  SQL and a message, copied into a new command: it is the admin's own from then on) and "Vuoto" (a `table`
  command, off, no connection). The presets are served by the admin-only `commandPresets` action
  (`COMMAND_PRESETS`), so the SQL stays in the server code.
- **Flow.** `useConversation.send` records the question and shows the working indicator as for any turn, then
  calls `streamCommandReply` (`features/chat/commands/`) instead of `streamAgentReply`: `POST /database/command`
  with `{ commandId }`, the composer of the answer's `format` writes the markdown, and the reply is a normal
  assistant message, so later model turns see it in their history. History gets one `data` activity ("Dati
  letti", `N righe`) and the reply with `model: 'comando'`, `command: <the command's name that day>`,
  `durationMs` and zero usage; the Storico shows "comando «Erogato», senza AI" (the first version stored
  `model: 'comando-erogato'`: still read). If it fails the chat shows the command's message and the turn is
  recorded with `error` and `errorDetail`; it **never falls back to the model**.
- **The server** (`actionCommand` in `functions/src/http/databaseEndpoint.js`, settings reader and migration in
  `functions/src/db/commandSettings.js`) finds the command by id in the stored settings and reads everything
  from it: the request carries only the id, never SQL or a connection, so a browser cannot choose the query.
  Same checks as `query`: command enabled, with a connection and a query, enabled connection, enabled tables,
  `validateSelect`, and `queryAsUser` with the verified email on a `userScoped` connection. Two results are
  errors instead of partial answers: the rows reach `maxRows` (the query is run with `maxRows + 1` to tell),
  and the query lacks a column of its format's contract (not checked on an empty result). The answer carries
  the `format` it ran. Failures are logged like the other query actions (`action: 'command'` plus `commandId`).
  Unknown id: 404.
- **Shortcuts.** A shortcut's `command` is a command id (the editor's "Cosa fa" lists the configured commands
  by name; the server only checks the id's shape, `[A-Za-z0-9_-]{1,64}`, since it cannot know the commands). In
  the chat it shows the command's first trigger as the question; if the command is off, incomplete or deleted,
  that text goes to the model as for any shortcut. The same field can hold the id of a list of documents without AI
  (see below): the pickers list both ("Comando: …", "Elenco: …", `shortcuts/noAiTargets.js`).
- **Migration.** Settings saved when there was one command hold it in `erogatoCommand`. Until the panel is saved
  (which writes the array), both readers (`normalizeCommands` in the browser, `commandsFromSettings` on the
  server) turn it into one command: `id: 'erogato'`, name «Erogato», `format: 'erogato'`, its connection,
  triggers, limits and message, and its SQL (an empty one runs the default query), so shortcuts saved with
  `command: 'erogato'` keep working. Once the array exists (even empty) `erogatoCommand` is ignored; a save
  does not write it back, and it is left in the document, unused.
- **"Prova ora"** (per command) runs the SAVED command as the signed-in admin and shows the row count and time, or
  the reason (missing columns, truncation, disabled tables…).

## Documents without AI

The same idea for files: "comunicazioni", "moduli mutuo" always mean the same list, so it should appear in a moment,
with no model call and no tokens. An admin defines **lists of documents without AI** in Configurazione → Documenti →
**Documenti senza AI** (`settings.noAiDocumentLists`, an array; shape and defaults in
`features/chat/documentLists/documentListSettings.js`). Unlike the rest of the Documents tab (saved as it goes) this
section is part of the shared settings object, so it has the panel's "Salva" bar.

- **A list**: `id` (generated, always `list-…`; shortcuts point to it like they point to a command), `name`, `enabled`,
  `triggers`, `title` (the card's heading; empty = the name), `intro` (optional line written under the card; empty =
  "Ecco i file (N)."), `emptyMessage` (empty = a default naming the list) and the selection, `selection` `rule` or
  `fixed`:
  - **rule**: `categories` (0..n names of `documentCategories`; a document qualifies with **any** of them, none = every
    document), `nameContains` (text the file name must contain, compared folded), `sort` `recent` (by the document's
    date, undated last) or `name` (numbers read as numbers), `limit` 1–50 (default 6). A rule that names categories
    none of which is still in the list matches nothing (the panel strikes them out), instead of turning "the
    communications" into "every document".
  - **fixed**: `documentIds`, chosen by hand with a picker (search over the indexed documents) and ordered with
    up / down, at most 50; an id that is gone (deleted, or no longer indexed) is skipped without a word.

- **Which documents.** Studied and archive-only documents are both eligible: the selection works on the chat catalog
  (`getChatCatalog`), which has them all. A list can be switched on only if it can show something (a fixed one needs
  a document).
- **When it shows.** The typed message is exactly one of the list's triggers (the same `normalizeTrigger` rules as a
  command: trimmed, lowercase, single spaces, no trailing punctuation), or a shortcut names the list's id
  (`documentListFor` in `matchDocumentList.js`). Anything longer goes to the model.
- **Trigger conflicts.** A word may belong to one list or command only. Both panels check against both kinds
  (`claimTriggers` / `triggerCollisions` over commands + lists): the Documenti panel refuses a word another list or a
  command has, the Database panel refuses a word a list has, and a clash already in the settings is flagged. If one
  still reaches the chat, **the command runs**: `useConversation.send` looks for a command first, then a list, then
  the model. Commands go first because the panels make conflicts impossible anyway and a command is the more
  expensive of the two to run by mistake (a query on the database).
- **Flow.** `useConversation.send` calls `streamDocumentListReply` instead of `streamAgentReply` or
  `streamCommandReply` (same callbacks): `getChatCatalog()` (cached a minute), `selectDocuments`, then a `file_choice`
  activity with `reason: 'listing'` — the usual `FileChoiceCard`, so picking a file gives the shared-file card with
  its download button — and a normal assistant line (the intro, or "Ecco i file (N)."), so later model turns see
  the exchange. Nothing matches: no card, only `emptyMessage`. The catalog cannot be read: a sentence and the
  turn is recorded with `error` and `errorDetail`; it never falls back to the model.
- **History.** The reply is stored with `model: 'elenco'` (not `comando`: the Storico says "elenco di documenti
  «Ultime comunicazioni», senza AI" — `documentListReplyLabel`), `command: <the list's name that day>` (the field a
  command's name uses; the server keeps it for either marker), zero usage and the duration. The card is stored like an
  `offer_files` one (ids, names, day) and comes back after a reload.
- **Shortcuts.** A shortcut's `command` field can hold a list id; "Cosa fa" lists "Elenco: …" next to the commands. In the
  chat it writes the list's first trigger (or its name) as the question; a list that is off, incomplete or deleted
  sends that text to the model as for any shortcut. The server only checks the id's shape.
- **Not done**: renaming a category in Documenti → Categorie does not rewrite the lists' rules (the old name shows struck
  out in the list's editor until it is replaced).

## Charts in the chat

`show_chart` draws a chart **in the browser** from exact numbers — it is never an image generated by a model.
**No chart library**: the charts are plain SVG written in React (`features/charts/ChatChart.jsx`), so there is
no new dependency, the look matches the app and the numbers drawn are exactly the ones received. The only
libraries involved are the ones already in the app: `lucide-react` for the button icons and `xlsx` (SheetJS,
loaded on demand) for "Scarica Excel".

| Type    | Use for                      | Default limit (admin-adjustable)               |
| ------- | ---------------------------- | ---------------------------------------------- |
| `bar`   | comparing categories         | 60 bars (10–200)                               |
| `line`  | trends over time             | 400 points (50–2000)                           |
| `donut` | parts of a total, one series | 8 slices, extra ones folded into "Altro" (3–8) |

### How a chart is made

1. **Declaration** — `chat/agent.js` adds `showChartTool(limits)` (`chat/tools/showChart.js`) to the model's
   tools, with the admin's limits written into its description so the model knows them up front.
2. **Call** — the model returns `show_chart` with `type`, `title`, `unit` and either `connectionId` + `sql` (data
   from the database) or `labels` + `series` (values it already has, e.g. from documents).
3. **Data** — `runShowChartCall` (`chat/tools/showChart.js`):
   - with `sql`: calls the `database` function, action `chartData` (`actionChartData` in
     `functions/src/http/databaseEndpoint.js`). Same checks as `query_database` (`queryContext`: one
     `SELECT`, enabled tables only, per-user filter), capped at 2000 rows (`CHART_MAX_POINTS`); more rows
     come back as `tooMany` and the model is asked to aggregate (`GROUP BY` month, bank…).
     `chartFromRows` turns the rows into a chart: first column = labels, every numeric column = one series.
   - without `sql`: `chartFromValues` cleans the model's values the same way.
4. **Checks** — `chartProblem(chart, limits)` refuses, with a sentence the model can act on: an unknown type,
   too many points or series for the admin's limits, series more than 50× apart (count vs euros — one axis
   only), a donut with more than one series, negative values or all zeros.
5. **Drawing** — the activity ends with `chart` attached; `chat/components/MessageList.jsx` renders
   `<ChatChart chart={…} />` above the answer instead of an activity card.
6. **Answer** — the model gets back `summarize(chart)`: every value up to 30 points, past that a fixed-size
   summary (total, min, max, first, last, top 5 per series), so a bigger chart never costs more tokens.
7. **History** — the chart is saved with the message; `storableChart` (`functions/src/history/historyStore.js`)
   validates it on the server (types, ≤2000 labels, ≤6 series, finite numbers) and it comes back after a reload.

### Files and functions

| File                                       | What it holds                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/charts/chartData.js`             | pure logic, no React: `CHART_TYPES`, `CHART_LIMIT_BOUNDS` / `chartLimits()` (admin limits clamped to their ranges), `chartFromRows`, `chartFromValues`, `chartProblem`, `niceTicks` (round axis steps), `formatValue` (Italian number format plus the unit), `foldSlices` (donut "Altro"), `summarize`, the palette          |
| `features/charts/ChatChart.jsx`            | the drawing: `CartesianChart` (bars and lines, axes, grid, label spacing by label width), `DonutChart`, `Tooltip`, `useWidth` (redraws on resize); "Mostra i dati", "Scarica PNG" and "Scarica JPG" (SVG → canvas at 2×, white background, title; JPG at quality 0.92), "Scarica Excel" (`downloadXlsx` in `shared/xlsx.js`) |
| `chat/tools/showChart.js`                  | `showChartTool(limits)` (the declaration) and `runShowChartCall` (data → checks → activity → response)                                                                                                                                                                                                                       |
| `functions/src/http/databaseEndpoint.js`   | `actionChartData`: the query on the server                                                                                                                                                                                                                                                                                   |
| `settings/components/ModelSettingsTab.jsx` | section "Grafici nella chat": the four sliders (stored as `settings.chartLimits`)                                                                                                                                                                                                                                            |

- Limits are set in Configurazione → Modello IA → "Grafici nella chat". They are about readability, not cost
  (see step 6).
- Colours: `SERIES_COLORS`, a fixed categorical palette of 8 (enough for a full donut) validated for
  colour-blind separation; "Altro" is grey (`OTHER_COLOR`) and slices never reuse a colour.
- **Custom colours**, on every chart type: when the operator asks ("Pellecchia in rosso", "la linea in
  verde"), the model passes `colors: [{ name, color }]` with a hex code. `name` is a series (bar, line,
  donut), a donut slice, a single bar of a one-series bar chart, or "Altro". `chartColors` keeps only known
  names and valid hex codes, `colorOf` falls back to the palette for the rest; to recolour a chart already
  shown the model draws it again. The colours are saved with the chart in history (`storableColors`).
- Hover for the exact value; legend from two series up.

## Back-end (functions/)

Operations that need 7hub data run as Cloud Functions in the same Firebase project, **deployed separately**.
The operator's Keycloak token is forwarded to the Java services as is (same model as `7hub-cqs`), so ACLs
and the sales hierarchy keep applying. **The environment comes from the token issuer**, not configuration.
Writes to production are blocked unless `ALLOW_PRODUCTION_WRITES=true`.

| Export                                             | Trigger                        | Purpose                                                                                                                                       |
| -------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools`                                            | HTTP `POST /tools/<name>`      | `search-person`, `person-details`                                                                                                             |
| `database`                                         | HTTP `POST /database/<action>` | connections and `commandPresets` (admin-only); `query`, `command`, `chartData`, `exportPreview`, `exportFile` (any operator, used by chat)    |
| `history`                                          | HTTP `POST /history/<action>`  | the caller's own `restore`/`question`/`turn`/`reset`/`shortcuts`/`saveShortcuts`; admin-only `list`/`transcript`/`users`/`allShortcuts`       |
| `databaseDev`, `historyDev`                        | same as above                  | development twins, working for `assistente-7hub-development` (DEPLOY.md)                                                                      |
| `drive`                                            | HTTP `POST /drive/<action>`    | admin only: `list` (service account email + sources), `add`, `update` (frequency), `remove`, `syncNow` (runs inside the request, up to 9 min) |
| `driveWebhook`                                     | HTTP `POST`, public            | Google Drive push notifications; verifies the channel token, marks the source due, syncs nothing                                              |
| `driveScheduler`                                   | schedule, every 15 minutes     | renews notification channels, runs the Drive sources that are due                                                                             |
| `driveDev`, `driveWebhookDev`, `driveSchedulerDev` | same as above                  | development twins                                                                                                                             |

`database` verifies the caller's **Firebase ID token** (`functions/src/auth/firebaseUser.js`) against
`users/{uid}` — unlike `tools`, a database connection has no per-operator ACL of its own, so this is the
only gate. It needs `DB_CRED_KEY` (32 random bytes, base64) in the function's environment to encrypt/decrypt
stored passwords: copy `functions/.env.example` to `functions/.env` for the emulator.

```bash
cd functions && npm install
npm test               # Drive sync tests: links, schedules, change plan, webhook token, index-card parity
npm run serve          # emulator on :5001
npm run smoke-test     # endpoint checks; set TOKEN_7HUB for real jsoggetto calls
```

`TOKEN_7HUB` comes from the `auth_data.token` cookie on 7hub (staging) and is passed only as an environment
variable, never written to a file. The diagnostic tool `person-response-shape`
(`scripts/inspect-response-keys.mjs`) exists only in the emulator.

Still missing: Firebase ID token verification on `tools` (defence in depth), and the decision on how the
chat obtains the operator's Keycloak token.

## Deploy

Pushing to `development` or `production` deploys automatically (GitHub Actions). Release flow, secrets,
manual deploy, rollback and the development app: **[DEPLOY.md](DEPLOY.md)**.

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
| `functions/src/http/cors.js`                 | `ALLOWED_ORIGINS`                            |
| 7hub `embed-config.ts`                       | iframe address                               |
| Console: Authentication → Authorised domains | Google sign-in fails without the domain      |
| Console: reCAPTCHA key `assistente-7hub`     | App Check does not attest without the domain |

## Open items

1. **Actions on 7hub** (create applications, search customers): the jsoggetto code in `functions/` is
   written and tested; how the chat obtains the operator token is still undecided.
2. **App Check enforcement** is in monitoring mode only; it becomes mandatory for AI Logic on 2 November 2026.
   Both sites' domains are in the reCAPTCHA key.
3. **Drive notifications** (webhooks) depend on Google accepting the function's address; if it does not, sources
   run on scheduled comparison alone (DEPLOY.md, "Google Drive sync").
4. **`dbSecrets/{id}` is still readable** by anyone with the app's `read` permission: the rules close only
   `chatConversations` and `chatUsers` to browsers. The AES-GCM encryption in
   `functions/src/db/credentials.js` is what protects the password; add `dbSecrets` to the rules'
   `isServerOnly` list (it is read only by the functions).
5. **`query_database` has no per-operator ACL**: any signed-in operator who may use the chat can read
   whatever is enabled, unlike the Java tools where the forwarded Keycloak token keeps ACLs and the sales
   hierarchy applying. Confirm this is acceptable for whatever ends up enabled before relying on it.
6. **The database user should be `SELECT`-only.** SQL validation (`functions/src/db/validateSelect.js`) is a
   safety net, not the boundary — ask for a read-only grant scoped to the one database before go-live.
