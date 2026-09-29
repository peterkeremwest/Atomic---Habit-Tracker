# Project: Atomic — Habit & To-Do Tracker PWA

## Project Overview
- Personal habit / to-do tracker named after *Atomic Habits*. Offline-first **PWA**, growing into a full-stack AWS app.
- Sister app: **Forge** (workout tracker, `Desktop/Weight Tracker App`, repo `peterkeremwest/workouttracker`, live at https://keepincheck.netlify.app/). Atomic must be able to sync with Forge: a fitness goal or task completed in either app shows as completed in both.
- Owner is not a professional coder. Explain decisions plainly and keep the company metaphor (glossary below) identical to Forge's.

## Session Continuity Rules
- At session start, read the checkpoint named in "Latest active checkpoint" below. It is the single source of truth. Do not re-read the whole checkpoints folder.
- Architecture constraint: **no-build, multi-file PWA** (see § Architecture). No bundler, no framework, no CDN-loaded code.
- Don't ask about committing, pushing or cutting a checkpoint after each change. Raise it only when the owner says the session is done.
- **Chat naming convention (same as Forge):** name a chat `vX.Y : <what's being built>` only when it's clearly implementation work toward the next checkpoint (take `X.Y` from LINEAGE.md). Never version-number chats prefixed `Sidebar:` (tangents), `Meta:` (how we work) or `Scratch:` (throwaway). If a chat is ambiguous, leave it unnumbered.

## Checkpoint Versioning
- **Source of truth:** the highest-numbered file in `checkpoints/`, by full version number. **Latest active checkpoint: `checkpoints/v0.1_CHECKPOINT.md`** (Phase 0, initiation: name, naming system, design direction, feature plan, sync-ready data model).
- **Version scheme:** major = Phase, minor = each checkpoint cut within that phase (minors don't need to match milestone numbers). A new Phase bumps the major number and resets to `.0`.
- **When to cut:** on each major milestone or completed feature. Never overwrite a shipped checkpoint. Cut the next one and update the pointer above.
- **Required contents of each `vX.X_CHECKPOINT.md`:**
  1. Current Phase & Milestone status
  2. Newly added/modified code
  3. Database schema or config updates
  4. Step-by-step verification instructions
  5. A **Project Progress Summary** copied verbatim from `checkpoints/LINEAGE.md` ("Historical Milestones" + "Cumulative Capabilities"), never re-derived
  6. A companion `vX.X_EXPLANATION.md`: plain language, a few flowing paragraphs (not bullets), before/after framing, using only the glossary below
- **This file is updated in the same turn a checkpoint is cut**, so the pointer never lags.
- **LINEAGE.md is updated in the same turn too:** append one line to "Historical Milestones", then rewrite "Cumulative Capabilities".
- **Glossary maintenance:** before an EXPLANATION.md mentions a component with no row below, add the row first, in the same turn, inside the same company metaphor.

### Plain-language glossary (one metaphor, shared with Forge: the whole system as a company)
Rows marked † are shared verbatim with Forge's CLAUDE.md. Keep them identical in both projects. Rows marked ◆ are new in Atomic and should be copied into Forge's glossary the next time Forge uses the same tool.

| Technical term | Company equivalent |
|---|---|
| DynamoDB table † | A filing cabinet, one drawer per user |
| Lambda function † | A clerk called in per-task |
| EC2 instance † | A clerk with a permanent leased desk |
| ECS / Fargate / EKS † | A staffing agency assigning desks as needed |
| API Gateway † | The front desk, checks ID and routes you |
| Cognito JWT authorizer † | The bouncer at the door |
| S3 bucket † | A storage closet, separate from the filing cabinet |
| `localStorage` (browser) † | Your personal notebook — works with the front desk closed (offline) |
| Sync / hydrate † | Copying pages between your notebook and the filing cabinet so both match |
| CORS preflight † | The bouncer asking "who's asking?" before letting the real question through |
| SQS † | An inbox tray on someone's desk |
| SNS † | A memo blasted to every subscribed department |
| EventBridge † | The office PA system |
| SageMaker † | The training room down the hall |
| CloudWatch / CloudTrail † | Security cameras and the sign-in log |
| CodePipeline / CodeBuild / CodeDeploy † | The renovation crew, tests in a mockup room before swapping it into the real building |
| CloudFormation / SAM / CDK † | The building's architectural blueprints |
| Multi-region deploy † | Branch offices in other cities |
| CloudFront † | Small courier depots that keep copies near the customer |
| Third-party CDN † | An outside vendor's warehouse — convenient, but an order can go missing without the company noticing |
| Vendoring / bundling a dependency † | Keeping a permanent copy in the company's own supply closet instead of reordering from the vendor every time |
| SQS dead-letter queue (DLQ) † | The "couldn't deliver" tray — jobs that still failed after retries land here to be looked at |
| Lambda runtime version (e.g. `nodejs24.x`) † | The edition of the rulebook the clerks are trained on |
| CSS design tokens / UI theme † | The lobby's paint-and-lighting scheme — one swatch card every room is keyed to |
| Service worker (`sw.js`) cache † | The receptionist's shelf of photocopies — keeps you working when the main office is unreachable |
| IndexedDB (browser) ◆ | A filing drawer at your own desk: like the notebook, but bigger and sorted into labeled folders; works with the front desk closed |
| Sync outbox (queued offline changes) ◆ | The outgoing-mail tray: changes made while the office was unreachable wait here and are sent when it reopens |
| Web app manifest ◆ | The business registration card: the company's name, logo and colors, used when the app is "installed" on a phone |
| JavaScript modules (multiple files) ◆ | Separate department binders instead of one giant company manual, so you open only the binder you need |
| Cloudflare (static hosting) ◆ | An outside storefront-leasing company with shopfronts in every city: whenever new blueprints are filed (a push to GitHub), it rebuilds the shop front automatically. The back offices (AWS) stay with the company |
| Cognito user pool shared by two apps ◆ | One badge office issuing badges that open the doors of both branch offices (Forge and Atomic) |
| Cognito app client ◆ | The badge reader installed at one particular branch's door |
| EventBridge custom event bus ◆ | A private PA channel that only Forge and Atomic are tuned into |
| EventBridge rule ◆ | A standing instruction to one clerk: "when you hear this kind of announcement on the channel, go do this" |
| Conditional write (newest-wins) ◆ | A clerk who checks the date stamp on an incoming memo and ignores it if the file already holds a newer version |
| EventBridge Scheduler ◆ | The receptionist's alarm clock: rings a clerk at an exact time (reminders, daily resets) |
| Web Push (VAPID) ◆ | A postcard mailed to the customer's home: it arrives even when they're not in the store |
| Workers Builds (Cloudflare Git integration) ◆ | The leasing company's own construction crew: it watches the records room and rebuilds the storefront every time new blueprints are filed |
| `public/` folder ◆ | The shop floor: the only part of the building customers can walk into. Back offices (rulebook, history log) are behind a locked door |
| GitHub repository ◆ | The records room holding every past version of the blueprints |

**Extension rule:** classify a new tool by function (who does the work / where things are stored / who's allowed in / how requests travel / how it's reported on / how releases roll out) and pick its equivalent from that family.

## Architecture (decided 2026-09-29)

### Frontend (Phase 1+)
- **No-build, multi-file PWA:** `index.html`, `css/` (theme tokens), `js/` (ES modules: `db.js`, `model.js`, `views/*.js`, `app.js`), `sw.js`, `manifest.webmanifest`, `vendor/` (fonts, any libraries).
  - Why not one file like Forge: Forge's `index.html` is ~2,600 lines, and every edit means working through all of it. Separate modules keep each session's edits small. ES modules run in the browser directly, so there's still no build step.
- **Everything self-hosted.** No CDN scripts or fonts (Forge's Chart.js CDN typo lesson). Fonts: Courier Prime (body) and VT323 (headers/numbers), both open-licensed, in `vendor/fonts/`.
- **Local storage: IndexedDB** plus a **sync outbox** (changes queue locally and are sent when online). It is bigger and sturdier than Forge's `localStorage`, and the outbox is ready for Phase 2.
- Theme: dark terminal. Phosphor green by default, amber and red selectable, muted secondary tones. Checkbox completion `[ ]` → `[✓]`, **no swipe gestures**.

### Frontend file map (v0.1.1 build)
- `public/index.html` is the shell. `public/js/app.js` handles routing and tap wiring. `state.js` holds the in-memory state plus every data action. `db.js` is IndexedDB + outbox. `model.js` is pure logic (dates, due/streak rules, quick-add parser, newest-wins merge). `ui.js` has helpers. `views/*.js` are the screens (today, habits, elements, system) and `sheets.js` (editor + long-press menu).
- `public/js/version.js` (`APP_VERSION`) and `CACHE` in `public/sw.js` must be bumped together on each release.
- Tests: `node test/model.test.mjs` (logic). `test/e2e.py` is a Playwright mobile-viewport run against `python3 -m http.server` in `public/`; it runs in Claude's cloud workspace, which has Chromium.
- Workflow used: build + test in the cloud workspace, write files into this folder, then commit + push from `device_bash`.

### Hosting
- **Frontend: Cloudflare Workers + Static Assets**, deployed by **Workers Builds** (Git integration): push to `main` → automatic publish. Config: `wrangler.jsonc` at repo root (Worker name `atomic`, which must match the dashboard). **Only `public/` is served**, so all app files go there and CLAUDE.md, checkpoints and the backend stay private. Pages is not used (Cloudflare recommends Workers for new projects). Separate from Forge's Netlify site, so Atomic pushes never trigger a Forge deploy.
- **Backend stays on AWS** (`us-east-1`). The Cloudflare URL must be listed as an allowed origin in the Atomic API's CORS settings (Phase 2).

### Backend (Phase 2+), a SAM stack like Forge's
- **Auth:** reuse Forge's Cognito user pool (`us-east-1_xmt1rEukj`) with a **new app client for Atomic**. One login works in both apps, and both see the same user `sub`, which is what makes cross-app sync possible.
- **Stack `atomic-backend`** (`backend/template.yaml`): HTTP API + Cognito JWT authorizer → Lambda (`nodejs24.x`, arm64) → DynamoDB `AtomicTable`, single-table design:
  - `pk = USER#<sub>`, `sk = ELEMENT#id | ISOTOPE#id | ATOM#id | MOLECULE#id | ORBIT#id | STATE#id | LOG#<date> | PROFILE`
  - Routes follow Forge's `data.js` pattern: `GET /data` full hydrate, `PUT/DELETE /data/<entity>/<id>`.

### Forge ↔ Atomic sync (Phase 3)
- A shared **EventBridge custom bus** (`personal-sync-bus`). When a shared item changes, the app's data Lambda publishes a `SharedItemChanged` event. Shared items are Atoms in the Fitness element (`Fi`) and Forge habits/workouts linked to them.
- Each app has a **rule** targeting its own `SyncInFunction`, which does a **conditional write** (newest `updatedAt` wins) and ignores events it sent itself (no loops). Failures get 2 retries → SQS DLQ, same as Forge's thumbnail pipeline.
- Requires a matching change in Forge (publish + receive), done as a Forge checkpoint too.
- Shared record envelope: `{ id, sourceApp, kind, title, element, completions: {date: status}, createdAt, updatedAt, deletedAt }`. Soft deletes only.

### Later phases
- Reminders: EventBridge Scheduler → Lambda → Web Push. (Correction to v0.1: SNS doesn't deliver browser push notifications; Web Push is sent from a Lambda.)
- Orbits auto-switching States; the NFC deck station hooks into States via phone automations (outside the PWA).
- Monitoring (CloudWatch alarms), weekly review (Step Functions), plan suggestions (Bedrock).

### Phase plan
| Phase | Versions | Goal |
|---|---|---|
| 0 | v0.x | Planning, repo, stack |
| 1 | v1.x | Local-only PWA MVP live on Cloudflare: Elements/Isotopes, Atoms, Today + Habits screens, terminal theme |
| 2 | v2.x | Cognito login (shared pool) + SAM backend + cloud sync |
| 3 | v3.x | Forge ↔ Atomic sync via EventBridge |
| 4 | v4.x | Orbits, States, reminders (Scheduler + Web Push) |
| 5 | v5.x | Monitoring, weekly review, Bedrock suggestions |

## Live Deployment
- **Repo:** `github.com/peterkeremwest/Atomic---Habit-Tracker`, its own repo, completely separate from Forge's `workouttracker`. The project folder itself is the repo root (no nested `atomic/` subfolder). It was published through GitHub Desktop ("Add existing repository" → "Publish repository").
- **Host:** Cloudflare Worker `atomic` via Workers Builds, connected 2026-09-29. Production branch `main`; preview builds enabled for other branches.
- **Live URL:** https://atomic.peterkeremwest.workers.dev. Verified 2026-09-29: the placeholder page loads, and `/CLAUDE.md` falls back to the app page instead of exposing the file (only `public/` is served).
- **Deploy timing:** a Workers Build takes about 3 minutes after a push. Check its status without credentials (the repo is public): `curl -s https://api.github.com/repos/peterkeremwest/Atomic---Habit-Tracker/commits/<sha>/check-runs` shows "Workers Builds: atomic" as `completed success`. Only then load the site with a cache-busting query (`/?v=N`).
- **How to verify the live site:** neither `device_bash` nor the cloud shell can reach `*.workers.dev` (both proxies refuse it). Use the built-in browser pane (site access already granted), or ask the owner to check.
- **Git from `device_bash`:** use Forge's proven pattern. `credential.helper` is set repo-locally to `store --file=.git-credentials`, and `.git-credentials` stays in `.gitignore` (never committed). It uses the same fine-grained PAT as Forge (renamed, and granted access to this repo on 2026-09-29). The file was copied from Forge's repo. If push/pull fails, check that `.git-credentials` exists here and that the PAT hasn't expired (it has a 90-day expiry, set up 2026-09-18). Never assume a push succeeded without checking `git status`/`git log origin/main`.
- **Git lock files from `device_bash`:** the Cowork shell can't delete files in this folder unless deletion is granted for the session. Without it, every git command leaves `.git/index.lock` / `HEAD.lock` behind and the next one fails. Ask for delete permission once per session before running git here, and if a lock is left over, remove `.git/*.lock` (only when no other git process is running).
- **AWS deploys run from the owner's own terminal, never `device_bash`.** That shell can't reach `amazonaws.com` and has no AWS credentials. Backend deploy (Phase 2+): `cd backend && sam build && sam deploy`.
- **Verification rule:** a checkpoint can call a milestone "live" only after the live URL is opened and shows the expected version.

## Lessons inherited from Forge (don't relearn these)
- API Gateway HTTP API: never `Method: ANY` on a CORS route (the preflight gets swallowed by the JWT authorizer → 401). Use explicit methods.
- Test locally over `npx serve .` → `http://localhost:3000`. `file://` pages fail CORS and can't register the service worker.
- Lambda `package.json` must sit inside the function's `CodeUri` folder.
- All Lambdas on `nodejs24.x`, arm64.
- The service worker must fetch the app code network-first (Forge's two-reload bug). Never cache API responses or signed URLs in the SW.
- Self-host every dependency.
