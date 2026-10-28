# Si-Ware Intranet — Project Guide

## Local runtime

- Start the application with `docker compose up --build -d`.
- The app is available at `http://localhost:8081`.
- Persistent dashboard data is stored in `data/intranet.json`; seed defaults are in `data/seed.json`.

## Verify changes

- Run `node --test tests/*.test.mjs` and `node --check server.mjs` for server or integration changes; check any edited browser JavaScript with `node --check <file>`.
- Run `git diff --check` before handing off. Rebuild with `docker compose up --build -d` when Docker is available; never assume a successful Node test proves the container image builds.
- Keep local `.env`, `data/intranet.json`, `data/notification-secrets.json`, uploaded media, and `data/audit trail archive/` out of Git. Do not place Google service-account keys or notification credentials in the repository or Docker image.

## Administration workspace

- `/admin.html` is the dedicated **Administration Panel**; do not reintroduce the legacy modal editor. Entry requires `admin.access` plus at least one permitted Administration page and its matching capability. The employee header exposes the restricted **Admin Panel** entry point.
- Content editors use page previews and focused forms. Save through each page's current action (for example, **Save changes**); do not assume one global save button.
- Administration navigation renders only the selected view. Preview editors must be ready on the first page selection; never pre-render hidden iframe editors or require an administrator to select a page twice before it becomes editable.
- Every managed page has JSON export, reset-to-default, undo/redo, and a per-page baseline in `data/admin-defaults.json`. Destructive removal requires an explicit confirmation, including a typed `DELETE` confirmation for collection-level removals.
- The panel manages Main Apps, Announcements, Social Media, Moments, Knowledge Hub, Events & key dates, Whistleblower, Recently Joined, New Si-Warians, Appearance, Media, users/access, and activity/audit records.
- Recently Joined supports two controlled deletion paths for roles with `action.delete`: select a colleague card in the preview and use **Delete colleague**, or use **More actions > Delete all colleagues** beside **Reset to default**. Bulk deletion requires typing `DELETE`, affects display cards only (never Google Workspace accounts), is audited, and can be undone in the active browser tab after a successful save.
- **Users** assigns authorized identities to roles. **Roles** presents editable cards for built-in and custom roles, with create, edit, and delete controls.
- Role editors separate `intranet.*` employee-page access from `admin.access`, Administration capabilities, `page.*` Administration-page access, and global actions. Enforce the same permissions on server routes and APIs, not only in navigation.
- Global-action permissions are `action.undo`, `action.redo`, `action.reset`, `action.import`, `action.export`, and `action.delete`. Content editing uses `content.edit`; there is no `action.edit_save` permission.
- Policies are managed only in **New Si-Warians → Policies**. A policy can use either a safe URL or an uploaded document; an upload replaces the URL, and clearing the URL removes the document reference.
- New Si-Warians manages first-week content, policies, checklist items, support portals, and the Security Awareness/Admin Portal training links directly from its employee-page preview.

## Recently Joined

- Employee photos use `photoUrl` when present and fall back to initials if unavailable or unable to load.
- The editor captures department and division; legacy `team` values remain only as a compatibility fallback for existing records.
- Records in `newMembers` are display content, not authentication accounts or role assignments. Add or edit them in Administration > Recently Joined, or import the supplied `public/recently-joined-import-template.csv` (up to 500 rows per import). Match imported records by company email where possible.
- Google sign-in still requests only `openid email profile`. A separate read-only delegated service account powers Directory sync. In Administration > Settings, admins select live employee/intern OUs; Guests and Consultants are excluded. Sync is disabled until explicitly enabled. It uses a 30-day creation lookback by default and Google user IDs/email for upserts, refreshes Google-sourced fields, preserves administrator-set Division and employee-set LinkedIn fields, and never treats `creationTime` as a hire date. Configure `GOOGLE_HIRE_DATE_FIELD` for Joined; otherwise it remains “To be confirmed.” See README for setup and privacy boundaries.

## Google Workspace content sync

- This is separate from Google Workspace SSO. It is a server-side, read-only service-account integration. Never place a service-account JSON key in browser code, `data/intranet.json`, `.env`, Git, or the Docker image.
- Store the key only at `secrets/google-workspace.json` on the Docker host. Docker mounts `./secrets` read-only at `/run/secrets`; set `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/run/secrets/google-workspace.json` and set `GOOGLE_SYNC_SUBJECT` to the delegated Workspace administrator email in the untracked `.env` file.
- Enable Admin SDK API and Google Calendar API in the Google Cloud project. Configure Domain-wide Delegation in Google Admin console for the service account's numeric client ID with exactly these read-only scopes: `admin.directory.user.readonly`, `admin.directory.orgunit.readonly`, and `calendar.events.readonly` (each with the full `https://www.googleapis.com/auth/` prefix). The delegated subject must be allowed to read the directory and selected calendar event details.
- The Settings API and controls require both `settings.manage` and `page.settings`; enforce this server-side. The browser must never receive the key, delegated subject, OAuth assertion, or Google access token. A failed setup must render a clear setup/error state rather than exposing credentials.
- Administration > Settings > Google Workspace content sync queries live Organization Units and allows only employee/intern branches. Reject Guests, Consultants, stale OU paths, non-approved calendar IDs, malformed inputs, and requests from roles missing either Settings permission. The UI may search/filter these OUs, but selection validation remains authoritative on the server.
- The approved resource calendars are `c_1886rrgqhtprciftkps7n738rs2fo@resource.calendar.google.com` (3rd Floor Meeting Room, resource ID `61221782182`) and `c_188bj799if2eoj4el09lt4nbmlrmg@resource.calendar.google.com` (Recreational Area Space, resource ID `2913182464`). A resource calendar ID is its `resourceEmail`, not its display name or internal resource ID.
- Sync is opt-in and disabled by default. Saving sources only persists the allowlist; enabling it schedules an immediate check and then a 15-minute server-side poll. **Sync now** is an administrator action that runs the same safe job. Never make Google calls from the employee browser.
- Directory imports include active, non-guest users who are direct members of the selected OUs and were created within `GOOGLE_RECENTLY_JOINED_LOOKBACK_DAYS` (default 30). Use Google user IDs/email for idempotent upserts. Preserve fields that an administrator manually corrected; do not use `creationTime` as a hire date. After every fully successful directory read, remove every Google-managed card not returned by the currently selected OUs—including cards from an OU later deselected by an administrator, or accounts moved out, suspended, or archived. Never remove a manual card or any card after a partial/failed OU read.
- Calendar imports expand recurring events in a rolling window from seven days ago through 90 days ahead. Public pages receive only non-private title, date/time, and resource-room metadata. For invited users only, the server may return the event description, approved HTTPS meeting links, and attachments through `/api/events/details`; attendee email addresses are never stored or sent to browsers, only SHA-256 hashes used for the server-side invitation check. Never import confidential/private entries. Preserve manual events. When a resource is deselected, remove only events previously imported from that resource and record the count in the audit event.
- Google sync writes an authoritative audit event for settings changes and completed content syncs. Guard file writes with a source snapshot check so the sync job never overwrites concurrent administrator edits. Failed resource reads preserve the prior imported events for that resource and appear as status errors.
- Google Directory propagation/search can be delayed. A new account may not appear immediately even with a successful sync; use the Settings status and audit trail to distinguish a permissions/setup error from Google propagation delay.

## Events & key dates

- `events` remains editable in Administration. Optional read-only Calendar sync imports only resource calendars selected in Administration > Settings. The 3rd Floor Meeting Room and Recreational Area Space are the approved choices. It expands recurring instances, uses stable source IDs, excludes private events, and preserves manually entered events. Selected resource event titles become employee-visible automatically.

## Audit trail and archive

- Server-side audit events and browser-reported page/control activity are separate streams in `data/intranet.json`. Browser activity is best-effort; authoritative content and access changes belong in server-side audit events. Whistleblower activity is excluded.
- Both streams have a fixed 90-day active retention period. On the first data load each UTC day, expired events are archived before removal. `audit-archive.mjs` writes one combined compressed JSON Lines file per calendar quarter, `data/audit trail archive/audit-trail-YYYY-QN.jsonl.gz`.
- `docker-compose.yml` bind-mounts `./data:/app/data`, so archives persist on the Ubuntu host beside `intranet.json`. Archives are not automatically deleted or included in active Audit Trail search/CSV export; include the folder in backups and monitor disk use. The former 20,000-event cap has been removed.
- This remains JSON-file storage with memory-backed sessions, **not** a 1,000-user production-ready audit store. Use transactional storage, shared sessions, and tested backup/restore before production.

## New Si-Warians policies

- The Essential Policies section renders its live data from `/api/dashboard`.
- Each policy card contains its summary, owner, audience, version, update status, and PDF actions; there is no separate policy register.
- Mandatory acknowledgements are recorded server-side in `policyAcknowledgements`, including the employee identity, policy versions, review timestamps, exact acceptance statement, and acceptance timestamp. An acknowledgement is invalidated automatically when a policy ID, version, or document URL changes.
- Google Workspace SSO uses `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_ORIGIN`, `GOOGLE_WORKSPACE_DOMAIN`, `GOOGLE_ADMIN_EMAILS`, and `SECURE_COOKIES=true`. Local administrator sign-in uses `LOCAL_ADMIN_EMAIL` and `LOCAL_ADMIN_PASSWORD`. The Users page may deactivate or reactivate any local or Google intranet account, including the environment local administrator; its role and password remain server-managed. When no local account remains active, the local-login option is removed from the login page and `/auth/local` is disabled. The demo employee identity applies only when neither sign-in method is configured.

## Theme and interaction behavior

- Dark theme rules live in `public/theme-toggle.css`, with final ordering overrides in `public/dark-mode-fixes.css` for social feed surfaces.
- `public/dark-mode-system.css` is the shared employee-facing dark surface layer; `public/admin-dark.css` owns the Administration-specific layer. Keep new controls, tables, dialogs, cards, and form states readable in both themes rather than relying on light-mode hard-coded colors.
- Company portal cards have explicit dark-theme colors.
- The Explore prompt fades out over 650 ms when the Knowledge Hub enters view, and stays dismissed for the browser session.

## Current approved baselines and employee experience

- `data/admin-defaults.json` is the approved **Reset to default** source for every managed collection. It currently mirrors the published `data/intranet.json` values for Apps, announcements and schedules/templates, social media, Moments, Knowledge Hub, events, Whistleblower, Our Team, New Si-Warians, policies and first-week tasks, support portals, global-page content, Settings, and Administration settings. When approving a new published baseline, update both intentionally; do not let a reset restore obsolete mock content.
- **Published baseline record — 24 October 2026:** the current employee-facing content is the approved reset point. `data/admin-defaults.json` and `data/seed.json` mirror the current managed content (14 Main Apps, 17 Knowledge Hub sessions, 184 colleagues, 300 events, current page copy, layouts, Whistleblower configuration, and administration settings). Home hero content and layout are included in the reset response; Home reset restores the saved baseline rather than a hard-coded starter layout. Reset actions must never restore old mock data, access accounts, employee sessions, or audit history.
- **Audit reset — 24 October 2026:** active `auditEvents` and `activityEvents` were intentionally cleared before publication. There was no `data/audit trail archive/` directory at that point. The normal 90-day archive policy remains in force for new records; do not reintroduce cleared events into the active trail.
- **Employee profile and directory:** Google Workspace sign-in defaults new users to `EMPLOYEE`; only explicitly configured administrators receive `ADMIN`. Google directory sync refreshes Google-sourced profile fields (for example name, title, manager, department, phone, organization unit, and employee ID) while preserving intranet-owned `division` and employee-managed `linkedinUrl`. Google photos are fill-only: sync adds a Google thumbnail only when the card has no existing photo; it never clears or replaces an existing Google or intranet photo. An employee-uploaded `profilePhotoUrl` always takes priority and is never replaced by sync. Division is displayed only after an administrator supplies it. Employees may maintain their LinkedIn URL and upload a high-quality original profile photo from My Profile; administrators can manage the same directory fields. The Our Team directory and profile dialog use the original photo where available and allow the full image to be opened without downscaling the source.
- **Profile completion guidance:** the profile reminder is intentionally Home-only. It asks employees to add LinkedIn, upload a photo when no photo exists, or upgrade a low-resolution Google Workspace photo with an original image. It disappears as soon as LinkedIn and an original photo are present and must not appear in Administration or other dedicated pages.
- **Whistleblower reporting routes:** both employee pages share the Our Team-style light/dark layout: `/whistleblower.html` is **Si-Bot Employee Voice Agent** and `/whistleblower-2.html` is the configurable **Google Form** route. Exactly one route is enabled at a time; shared navigation exposes only the enabled page. The Google Form route is the shipped default and is restored by **Reset to default**. Administration uses one preview-first editor, provides a direct switch between the two routes, and allows the Google Form URL to be edited and validated in the page preview. Do not restore the legacy dual-editor UI.
- **Legacy Si-Voice credential:** `/employee-voice.html` sends messages only to the same-origin authenticated `/api/si-voice/chat` relay. The relay is unavailable unless `SI_VOICE_API_TOKEN` is set in the server environment; never place that token in an HTML/JavaScript file, Git, dashboard data, or an audit event. The relay deliberately does not audit employee messages or the upstream response.
- **Main Apps and support language:** Company Portal is the employee entry point to submit and track Administration, Finance, and People Team requests. Si-Bot is limited to AI chat, specialist agents, questions, guidance, and lightweight files. Si-Brain is the main AI platform for Si-Ware knowledge with ClickUp, Google Drive, Gmail, and Google Calendar. Keep these descriptions consistent in Main Apps, onboarding, and all intranet callers.
- **Visual completion:** Our Team, both Whistleblower routes, New Si-Warians, support portal cards, and the Administration workspace have been polished for a professional shared design system. Maintain readable light and dark states—especially dialogs, tables, callouts, MOHR imagery, and administration forms—when introducing future UI changes.
- Global Pages Content owns the shared brand/logo/favicon, header, footer, login copy, and global visual content. Home remains a separate Administration entry and is not duplicated in the global editor.
- The dashboard `Recently Joined` widget remains concise and shows the latest two colleagues. `/recently-joined.html` is the full **Our Team** directory, with filters, contact links, employee ID, and complete profile details on selection.
- User management supports Google identities and local intranet identities without exposing a password field in the administration UI. The protected local administrator is defined by runtime configuration; do not create or display local credentials in content data.
- The first-week checklist supports independent completion gates: policy acknowledgement, Security Awareness video completion, Company Portal training engagement, and opening a configured resource link. A locked task explains its prerequisite; viewing or editing an Administration preview must never complete an employee task.
- The dashboard header includes an in-app announcement bell. It derives its items from published announcements, keeps read state per signed-in employee in browser storage, allows individual or bulk read acknowledgement, opens the corresponding announcement, and refreshes the dashboard announcement feed every 60 seconds while the page is visible. It is an in-app inbox, not an external email or push-notification service.
- **Announcement delivery:** The notification controls sit at the top of every announcement editor. The global Notifications settings determine which channels appear there. When email is globally disabled, hide its toggle and To, CC, and BCC fields, and show an in-app-only note directing editors to a system administrator. When email is available, show those fields only while the announcement's email option is selected. Preserve existing delivery choices and recipients when a global channel is unavailable and an announcement is edited. Each announcement, schedule, and reusable template can target the bell to specific company email addresses (or all signed-in users when blank). Announcement content remains visible on the announcement page; targeting controls only the bell. Email uses `intranet@si-ware.com` through Gmail SMTP. If global email is disabled when an announcement publishes, mark that delivery `skipped` so it does not send later when email is reenabled.
- **Notifications administration:** Only roles with both `settings.manage` and `page.notifications` can open Administration > Notifications, enable or disable the bell and email globally, choose each channel's default state for new announcements, or save/remove the Gmail App Password. The global bell switch suppresses all employee announcement alerts without changing each announcement's saved setting. The UI never receives the saved password. It is AES-256-GCM encrypted in host-only `data/notification-secrets.json` using `NOTIFICATION_SECRET_KEY` from the Ubuntu `.env`; do not rotate that key while an app password must remain usable. The secret file is ignored by Git and Docker build context, and must be included in host backups with restricted permissions.

---

## Detailed project memory

## Purpose

Docker-local prototype of a Si-Ware Systems employee intranet. It is designed as a people- and information-first company workspace with a Quick Launch dock, Knowledge Hub, internal updates, policy access and a demo no-code admin experience.

## Run locally

```powershell
docker compose up --build
```

Open `http://localhost:8081`. Host port `8081` maps to container port `8080` because port `8080` was reserved on the development machine.

## Ubuntu deployment and Cloudflare cutover

- The production deployment target is the Ubuntu server at `192.168.1.185`. The checked-out application lives at `/opt/Si-Ware-Intranet` and runs as the `intranet` Docker Compose service. Do not treat the development laptop as the production host.
- Persistent deployment data is the host-mounted `data/` directory. Before rebuilding or migrating the Ubuntu server, back up `data/intranet.json`, `data/uploads/`, and `data/audit trail archive/` when present. The committed `data/seed.json` and `data/admin-defaults.json` contain the approved content baseline, but do not replace live uploads or current runtime data.
- Production secrets stay outside Git: Ubuntu `.env` holds runtime environment values and `secrets/google-workspace.json` holds the Google delegated service-account key. The key is mounted read-only at `/run/secrets/google-workspace.json`; keep the host files mode `0600` and the `secrets/` directory mode `0700`. Never display, commit, or copy their contents into application data.
- For the temporary LAN-only validation phase, bind the application to the Ubuntu LAN address as `192.168.1.185:8081:8080` and map `192.168.1.185 intranet.siwareapps` in an approved internal DNS service or an individual Windows hosts file. The temporary URL is `http://intranet.siwareapps:8081/login.html`. This is for local-network testing only; use local administrator sign-in rather than Google OAuth on the HTTP hostname.
- The Cloudflare Tunnel is not configured yet. Until it is, do not publish the Ubuntu host directly to the Internet and do not expose port `8081` beyond the intended LAN. After the tunnel is configured, restore the app binding to `127.0.0.1:8081:8080`, map the Cloudflare public hostname to the Compose service `http://intranet:8080`, set `APP_ORIGIN=https://<approved-public-hostname>`, and set `SECURE_COOKIES=true`.
- At Cloudflare cutover, add the exact `https://<approved-public-hostname>/auth/google/callback` redirect URI to the Google OAuth web client before enabling employee Google sign-in. Google OAuth redirect URIs for DNS names must use HTTPS; the temporary internal HTTP hostname is not an approved production callback.
- Verify each deployment with `docker compose ps`, `docker compose logs --tail 30 intranet`, and a local HTTP request before switching the employee-facing hostname. Container recreation signs users out because sessions are memory-backed.

## Architecture

- `audit-archive.mjs` handles 90-day audit/activity retention and one compressed archive file per calendar quarter under `data/audit trail archive/`.
- `server.mjs` — dependency-free Node HTTP server and JSON API.
- `data/seed.json` — initial dashboard, policy, search and content data.
- `data/intranet.json` — runtime persistence; bind-mounted by Docker and intentionally ignored by Git.
- `data/admin-defaults.json` — the reset baseline for every managed content collection. Update this intentionally when a new approved default is required.
- `data/uploads/` — persistent local employee photos published from Admin CMS and served at `/uploads/`.
- `public/admin.html`, `public/admin.js`, and `public/admin-*.css` — dedicated Administration Panel shell, controls, editor surfaces, dark theme, and page tooling.
- `public/index.html` + `public/app.js` — employee dashboard and client interactions.
- `public/new-hires.html` — shareable onboarding and policy destination.
- `Dockerfile` and `docker-compose.yml` — local runtime.

## Implemented features

- Responsive Si-Ware branded dashboard with real `siware-logo.png` and `Icon.png` assets.
- Dark-theme toggle, responsive Quick Launch dock, Knowledge Hub filtering/video modal, RSS selector, Moments, social widgets and events.
- Universal search UI and API indexing policies, people, apps, forms, Knowledge Hub sessions, FAQs and service requests with type labels and destinations.
- The dashboard highlights recent colleagues; the full directory is `/recently-joined.html`, separate from New Si-Warians onboarding at `/new-hires.html`.
- Administration > Recently Joined edits employee display cards and accepts local image uploads (PNG/JPEG/WebP/GIF, maximum 2 MB) or CSV import.
- Dashboard content order: Industry Pulse, Facebook, Si-Ware on YouTube and LinkedIn share the first content row; Moments is a single four-item row; Knowledge Hub sessions and Calendar follow as full-width sections.
- Policy governance records with `owner`, `reviewDate`, `audience`, `version`, and `canonicalUrl` fields.
- Shareable New Si-Warians! page at `/new-hires.html` with first-week guidance and policy content.
- Whistleblower guidance page at `/whistleblower.html`, linked directly below Knowledge Hub sessions. Its instructions are aligned to the single Employee Voice reporting method: select “Start a confidential report” beside “Ready to start?”, describe the concern in the in-page agent, and follow its guided conversation. The local prototype does not store reports.
- Dedicated Administration Panel with preview-first editors for all employee destinations, standard action placement, responsive dark mode, and accessible dialogs.
- Per-page JSON backups, CSV templates/imports where applicable, undo/redo history, and reset-to-approved-default actions. Knowledge Hub CSV import reports exact row failures and rejects duplicate session titles after Unicode, whitespace, and case normalization; the same duplicate rule applies to manual creation and edits.
- Social Media is a configurable collection rather than four fixed fields. Each card has a title, safe HTTP(S) destination, link label, and approved SVG icon (`LinkedIn`, `Facebook`, `YouTube`, `website`, `Instagram`, `X`, or generic). The employee directory responds to any number of cards.
- New Si-Warians keeps its employee-facing layout configurable from the preview. Policies support uploaded files or URLs; Security Awareness (English and Arabic) and Admin Portal Training are configurable video links displayed before everyday tools.
- Media inventory/upload tooling accepts the approved document, image, and video types and identifies uploaded files that are currently in use.
- Role-based access starts with `EMPLOYEE`, `CONTENT_EDITOR`, `AUDIT_VIEWER`, and `ADMIN`; administrators can also create and maintain custom roles. Persisted role configuration is stored in the intranet data as `accessRoles` and `disabledDefaultRoles`.
- Role definitions include capability permissions, page-access permissions, and global-action permissions. `ADMIN` always retains `access.manage`; it cannot be deleted, and a role with assigned users cannot be removed.
- Server-side endpoints enforce capability and page permissions, audit content changes and authentication events, and accept client activity batches. Active events are archived after 90 days rather than silently truncated by a record-count cap.
- Accessibility improvements: skip link, labelled controls, keyboard search shortcut, dialog semantics, reduced-motion support, contrast and readable-text refinements.

## API

- `GET /api/dashboard`
- `GET /api/search?q=<query>`
- `GET /api/auth/options`, `GET /api/auth/me`, `POST /auth/local`, `GET /auth/google`, `GET /auth/google/callback`, and `POST /auth/logout` handle sign-in and sessions.
- `GET /api/admin/dashboard` and `PATCH /api/admin/dashboard` load and save Administration content with the required permissions; `GET /api/admin/defaults` supplies approved reset baselines.
- `GET /api/admin/summary`, `GET /api/admin/audit`, and `GET /api/admin/audit/export` power the restricted audit view; `POST /api/activity` accepts browser-reported activity batches.
- `POST /api/uploads` and `GET /api/admin/media` handle approved media uploads and inventory. Content/import/reset operations must use authenticated Administration endpoints.
- `GET /api/admin/access` lists access users and resolved roles; `PATCH /api/admin/access` assigns a role to an authorized identity.
- `POST /api/admin/roles` creates a custom role, `PATCH /api/admin/roles` updates its permissions, and `DELETE /api/admin/roles/:roleId` removes an unassigned non-`ADMIN` role.

## UI design direction

The current visual system follows the supplied Si-Ware portal reference: clean white and blue surfaces, cyan accents, compact utility navigation, and task-oriented hierarchy. `public/professional-polish.css` provides the refined enterprise visual layer, `public/professional-corrections.css` handles targeted clarity and contrast adjustments, and `public/formal-refinement.css` establishes the final executive workspace finish. The Impeccable skill was installed project-locally under `.agents/skills/impeccable` and used for the UI/accessibility refinement.

`public/motion-finish.css` adds an accessible final motion layer: one hero signal entrance plus short content-refresh feedback for feeds, Knowledge Hub filters, Moments and Admin CMS. It respects `prefers-reduced-motion`.

`public/viewport-efficiency.css` provides a wide-screen density pass so the complete Industry Pulse, Facebook, YouTube and LinkedIn row fits in the first viewport at 100% zoom while preserving the existing tablet and mobile layouts.

`public/explore-nudge.css` adds a dismissible, one-session discovery prompt in the lower-right corner. It guides employees to Moments and the Si-Ware Knowledge Hub without blocking dashboard work. The restricted Admin Panel entry sits in the header beside the profile controls, freeing the lower-right area for employee discovery.

The compact discovery prompt tells employees about the dashboard sections below the company-channel cards: Moments, Knowledge Hub, Events & key dates and Employee Voice. The structured default dashboard order is hero beside New Si-Warians!, LinkedIn/Facebook/YouTube/Industry Pulse, Moments, Knowledge Hub, Events & key dates, then Whistleblower. The saved layout is versioned so this structured default replaces the earlier flexible layout once, while future CMS layouts remain customizable.

Every page has an accessible icon-only Dark mode / Light mode control. The shared theme saves the employee's preference in browser storage and applies a dedicated dark surface treatment to the dashboard, New Si-Warians and Whistleblower pages, including their page shells, navigation, dock, search, widgets, tables and policy surfaces.

The Si-Ware on YouTube widget links directly to the official channel: `https://www.youtube.com/@Si-Ware_Systems`.

The YouTube widget requests the official public channel RSS feed through `/api/youtube/latest`, caches it for 15 minutes, and renders the latest three videos with thumbnails, publication dates and direct watch links. It has a clear fallback to the channel when the external feed is temporarily unavailable.

The Facebook and LinkedIn cards now use intranet-owned, English social summaries with one keyboard-accessible scrollbar each, preserving the four-card dashboard row. This replaces third-party embedded social chrome, which could force Arabic locale controls and a second scrollbar. Both feeds show a date on every summary; each Facebook item opens the official Facebook page, while LinkedIn’s three verified public updates (Global Innovation Index recognition, WIPO panel, and Material Perception for Physical AI) retain direct links to their official full posts. At wide desktop sizes, the redundant New Si-Warians introduction is hidden and all three YouTube entries use a one-line, keyboard-accessible preview, allowing the complete four-card row to fit in the initial viewport.

## Recent dashboard changes

- The dashboard separates `Recently Joined` from `New Si-Warians!`. Recently Joined shows the latest colleagues and links to the dedicated `/recently-joined.html` directory.
- Recently Joined records support four employment segments (`Full Time`, `Part Time`, `Summer Intern`, `Graduate Intern`) plus Department and Division metadata. The dedicated directory exposes filters for all three dimensions, and the Admin CMS captures them for each new colleague.
- The New Si-Warians! dashboard widget and `/new-hires.html` contain onboarding guidance, first-week actions, essential policies, everyday tools and support. They no longer include the recent-people directory.
- The default dashboard layout is versioned as `structured-v5`: hero beside Recently Joined, then New Si-Warians! guidance, company channels and Industry Pulse, Moments, Knowledge Hub, Events and Employee Voice.
- `/api/youtube/latest` renders the latest three channel videos. Successful payloads are cached for 15 minutes and persisted in `data/youtube-latest.json`; when YouTube is unreachable, the saved payload is displayed with a reconnecting notice.

## Policy documents, onboarding and administration

- Administration is the dedicated `/admin.html` workspace, not a modal or legacy employee-page editor. Its sidebar separates content, media, access management, audit, and settings.
- Policy PDFs are uploaded through the Content > Policies form, stored under `/uploads/`, and rendered in an in-app full-screen document viewer. Employees can View or Download an approved PDF from the Essential policies cards; the Policy register remains informational.
- The document viewer uses Poppler (`pdfinfo`, `pdftotext` and `pdftoppm`) to render pages and provide document search. Search shows a precise occurrence count, highlights every matching word, moves to the next match with Enter, and marks the active occurrence.
- Global search includes matching policy document pages in addition to the existing intranet content. The server exposes `/api/documents/search`, `/api/documents/highlights` and `/api/documents/page` for the viewer and search experience.
- Policy register metadata shows the PDF’s actual last-uploaded modified timestamp in the Cairo time zone. The timestamp is derived from the uploaded file rather than entered manually; policies without an uploaded PDF show `No file uploaded`.
- The onboarding Need help? directory has consistent routes for IT Support, People & HR, Administration and Finance. It links to the appropriate Company Portal, SolarWinds Service Desk or MOHR route, and exposes the approved IT and People Team email contacts.
- `supportPortals` defines the three employee destinations: Company Portal (Administration, Finance & People Team), SolarWinds Service Desk (IT Support), and MOHR (Payslips & HR topics). Administrators configure each portal’s name, description, safe destination link and SVG icon through Administration > Apps; an unconfigured portal displays `Link coming soon` to employees.

## Production follow-up

- Consider mapping roles to approved identity-provider groups; keep server-side `intranet.*`, `admin.access`, `page.*`, capability, and action checks aligned with the role editor.
- Connect policy cards to approved document storage and add policy publishing/editing controls to the CMS.
- Replace demo social/RSS data with server-side feed integrations.
- Replace JSON-file persistence and in-memory sessions with transactional/shared storage; harden upload scanning, audit durability, archive monitoring, backup/restore, and policy approval workflows.
- Evaluate a reviewed-draft publishing workflow for Google-sourced people and events if automatic publication from the approved OU/calendar allowlist is not sufficient. Google sign-in alone still does not provide directory/calendar data.
- Add automated accessibility and browser E2E tests before launch.

## Current portal destinations and live content

- The shared destination navigation (`public/destination-nav.js`) exposes Home, Main Apps, Announcements, Recently Joined, Company news, Social Media, Moments, Knowledge Hub, Events & key dates, Whistleblower, and New Si-Warians on every main employee-facing page.
- The Home **Industry Pulse** widget is a curated, source-linked internal reading feed, not an uncontrolled browser-side scraper. Preserve its existing source selector and compact social-post treatment. Its approved sources are Nature Optical Spectroscopy (`https://www.nature.com/subjects/optical-spectroscopy`), Semiconductor Digest (`https://www.semiconductor-digest.com/`), Dairyland Laboratories (`https://dairylandlabs.com/`), MDPI Agriculture (`https://www.mdpi.com/journal/agriculture`), and the Journal of Near Infrared Spectroscopy (`https://journals.sagepub.com/home/jns`). Each entry must show its source, date/context, concise factual summary, and an external `noopener` link to the relevant source or article. Do not restore the removed ROHM source or unlinked placeholder headlines. A future automatic refresh requires server-side caching, source-specific review, and failure fallbacks; never fetch third-party content directly from employee browsers.
- Dedicated pages render live dashboard data through `public/portal-pages.js`: `/apps.html`, `/announcements.html`, `/social-media.html`, `/moments.html`, `/knowledge-hub.html`, and `/events.html`.
- `/news.html` and the dashboard company-news module use `/api/company-news` to load and cache the latest official Si-Ware news. The news carousel advances automatically while retaining explicit previous/next controls.
- The Social Media page links to Si-Ware's official LinkedIn, Facebook, YouTube, and website channels; its YouTube entries use `/api/youtube/latest`.
- Moment image cards use a contrast scrim over photography so captions remain readable, and destination pages provide a horizontally scrollable navigation treatment at narrow widths.

## Current shared employee UI (October 2026)

- The employee-facing shell uses a compact two-row desktop header. The first row contains the linked official Si-Ware logo plus an `Intranet` label; the right side contains the intranet search trigger, theme control, restricted Admin CMS action, and the signed-in employee photo, name, and access level. The second row contains all primary destinations with a clear active state.
- `public/destination-nav.js` owns the shared dedicated-page header, full employee profile display, search panel, navigation active state, and shared footer. Do not create page-specific copies of these controls.
- The header search trigger appears before the theme control. It opens an inline, right-anchored search field and results panel; the older dedicated-page search field was removed. It is keyboard accessible and closes with Escape or outside click.
- Employee headers display the authenticated user's profile and access level, with an uploaded avatar when available. Do not hard-code a specific employee identity into shared UI.
- Main Apps are a one-row carousel rather than a grid. It advances one card at a time automatically, pauses while an app card is hovered or focused, and has previous/next controls aligned immediately beside the visible first/last card. It intentionally has no section heading, search field, scroll rail, or divider lines.
- Dedicated destination pages use the compact intro spacing in `public/dedicated-standard.css`. This includes the generic destinations and the special policy/news templates: Whistleblower, Recently Joined, New Si-Warians, and Company News.
- `public/news-shifter.js` waits for the requested official news image to load and decode before showing its slide. It preserves source order, starts on the first source story, and does not substitute a later story when an image is temporarily unavailable.
- The Social Media destination is a single connected directory card with four separate official links: LinkedIn, Facebook, YouTube, and the Si-Ware website. Its channel icons are compact SVGs, except the website entry which uses the official `public/Icon.png` Si-Ware mark. The directory has a short staggered entrance and precise hover/focus feedback; it honors `prefers-reduced-motion`.
- `public/shared-footer.css` styles the universal footer. On desktop it has three zones: left `© 2026 Si-Ware Systems · Internal use only`, centered `For technical support, contact ithelpdesk@si-ware.com` (a `mailto:` link), and right compact LinkedIn/Facebook/YouTube/Si-Ware social icons. It stacks cleanly on mobile. Existing policy-page ownership/review details are preserved at the left.
- When editing shared navigation, social channels, search, or footer behavior, update `public/destination-nav.js`, `public/header-search.css`, `public/dedicated-standard.css`, and/or `public/shared-footer.css` instead of patching individual routes. Validate with `node --check public/destination-nav.js`, `git diff --check`, the Impeccable layout detector, and `docker compose up -d --build`.
