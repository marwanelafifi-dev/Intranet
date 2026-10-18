# Si-Ware Intranet — Project Guide

## Local runtime

- Start the application with `docker compose up --build -d`.
- The app is available at `http://localhost:8081`.
- Persistent dashboard data is stored in `data/intranet.json`; seed defaults are in `data/seed.json`.

## Administration workspace

- `/admin.html` is the dedicated **Administration Panel**. It replaces the legacy modal CMS and is shown only to people with `content.edit` or `audit.view`; the employee header exposes the same restricted entry point as **Admin Panel**.
- The panel uses a consistent preview-first pattern: add or edit an item, make changes in the editor alongside the employee-page preview, then use **Save content** to publish. Page actions are grouped consistently into primary creation, save/refresh, data, history, and destructive actions.
- Every managed page has JSON export, reset-to-default, undo/redo, and a per-page baseline in `data/admin-defaults.json`. Destructive removal requires an explicit confirmation, including a typed `DELETE` confirmation for collection-level removals.
- The panel manages Main Apps, Announcements, Social Media, Moments, Knowledge Hub, Events & key dates, Whistleblower, Recently Joined, New Si-Warians, Appearance, Media, users/access, and activity/audit records.
- Policies are managed only in **New Si-Warians → Policies**. A policy can use either a safe URL or an uploaded document; an upload replaces the URL, and clearing the URL removes the document reference.
- New Si-Warians manages first-week content, policies, checklist items, support portals, and the Security Awareness/Admin Portal training links directly from its employee-page preview.

## Recently Joined

- Employee photos use `photoUrl` when present and fall back to initials if unavailable or unable to load.
- The editor captures department and division; legacy `team` values remain only as a compatibility fallback for existing records.

## New Si-Warians policies

- The Essential Policies section renders its live data from `/api/dashboard`.
- Each policy card contains its summary, owner, audience, version, update status, and PDF actions; there is no separate policy register.
- Mandatory acknowledgements are recorded server-side in `policyAcknowledgements`, including the employee identity, policy versions, review timestamps, exact acceptance statement, and acceptance timestamp. An acknowledgement is invalidated automatically when a policy ID, version, or document URL changes.
- Google Workspace SSO is enabled by setting `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_ORIGIN`, `GOOGLE_WORKSPACE_DOMAIN`, `GOOGLE_ADMIN_EMAILS`, and `SECURE_COOKIES=true` from `.env.example`. Until then, local Docker uses a clearly marked demo employee identity for testing only.

## Theme and interaction behavior

- Dark theme rules live in `public/theme-toggle.css`, with final ordering overrides in `public/dark-mode-fixes.css` for social feed surfaces.
- Company portal cards have explicit dark-theme colors.
- The Explore prompt fades out over 650 ms when the Knowledge Hub enters view, and stays dismissed for the browser session.

---

## Detailed project memory

## Purpose

Docker-local prototype of a Si-Ware Systems employee intranet. It is designed as a people- and information-first company workspace with a Quick Launch dock, Knowledge Hub, internal updates, policy access and a demo no-code admin experience.

## Run locally

```powershell
docker compose up --build
```

Open `http://localhost:8081`. Host port `8081` maps to container port `8080` because port `8080` was reserved on the development machine.

## Architecture

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
- Welcome-to-Si-Ware announcement widget showing the two newest colleagues, their Direct Managers and optional employee photos, with the complete welcome announcement list on the New Hires page.
- Admin CMS New Members tab for publishing welcome announcements, including local image upload (PNG/JPEG/WebP/GIF, maximum 2 MB).
- Dashboard content order: Industry Pulse, Facebook, Si-Ware on YouTube and LinkedIn share the first content row; Moments is a single four-item row; Knowledge Hub sessions and Calendar follow as full-width sections.
- Policy governance records with `owner`, `reviewDate`, `audience`, `version`, and `canonicalUrl` fields.
- Shareable New Si-Warians! page at `/new-hires.html` with first-week guidance and policy content.
- Whistleblower guidance page at `/whistleblower.html`, linked directly below Knowledge Hub sessions. Its instructions are aligned to the single Employee Voice reporting method: select “Start a confidential report” beside “Ready to start?”, describe the concern in the in-page agent, and follow its guided conversation. The local prototype does not store reports.
- Dedicated Administration Panel with preview-first editors for all employee destinations, standard action placement, responsive dark mode, and accessible dialogs.
- Per-page JSON backups, CSV templates/imports where applicable, undo/redo history, and reset-to-approved-default actions. Knowledge Hub CSV import reports exact row failures and rejects duplicate session titles after Unicode, whitespace, and case normalization; the same duplicate rule applies to manual creation and edits.
- Social Media is a configurable collection rather than four fixed fields. Each card has a title, safe HTTP(S) destination, link label, and approved SVG icon (`LinkedIn`, `Facebook`, `YouTube`, `website`, `Instagram`, `X`, or generic). The employee directory responds to any number of cards.
- New Si-Warians keeps its employee-facing layout configurable from the preview. Policies support uploaded files or URLs; Security Awareness (English and Arabic) and Admin Portal Training are configurable video links displayed before everyday tools.
- Media inventory/upload tooling accepts the approved document, image, and video types and identifies uploaded files that are currently in use.
- Role-based access has `EMPLOYEE`, `CONTENT_EDITOR`, `AUDIT_VIEWER`, and `ADMIN` permissions. Server-side endpoints enforce permissions, audit content changes and authentication events, accept client activity batches, and preserve a bounded event history.
- Accessibility improvements: skip link, labelled controls, keyboard search shortcut, dialog semantics, reduced-motion support, contrast and readable-text refinements.

## API

- `GET /api/dashboard`
- `GET /api/search?q=<query>`
- `PATCH /api/dashboard` (demo admin header required)
- `POST /api/announcements`, `POST /api/sessions`, `POST /api/policies` (demo admin header required)
- `GET /api/auth/me`, `GET /api/admin/defaults`, `GET /api/admin/summary`, `GET /api/admin/audit`, and `GET /api/admin/activity` power restricted administration and audit views.
- `POST /api/admin/upload`, `GET /api/admin/media`, and `DELETE /api/admin/media` manage approved binary assets. Content/import/reset operations must use the corresponding authenticated Administration Panel endpoints.

## UI design direction

The current visual system follows the supplied Si-Ware portal reference: clean white and blue surfaces, cyan accents, compact utility navigation, and task-oriented hierarchy. `public/professional-polish.css` provides the refined enterprise visual layer, `public/professional-corrections.css` handles targeted clarity and contrast adjustments, and `public/formal-refinement.css` establishes the final executive workspace finish. The Impeccable skill was installed project-locally under `.agents/skills/impeccable` and used for the UI/accessibility refinement.

`public/motion-finish.css` adds an accessible final motion layer: one hero signal entrance plus short content-refresh feedback for feeds, Knowledge Hub filters, Moments and Admin CMS. It respects `prefers-reduced-motion`.

`public/viewport-efficiency.css` provides a wide-screen density pass so the complete Industry Pulse, Facebook, YouTube and LinkedIn row fits in the first viewport at 100% zoom while preserving the existing tablet and mobile layouts.

`public/explore-nudge.css` adds a dismissible, one-session discovery prompt in the lower-right corner. It guides employees to Moments and the Si-Ware Knowledge Hub without blocking dashboard work. The Admin CMS trigger now sits in the header beside the profile controls, keeping administrative access visible while freeing the lower-right area for employee discovery.

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

- The Administration workspace is a full-width modal workspace with Overview, Content, People, Layout and Apps tabs. It provides GUI management for announcements, Knowledge Hub sessions, policies, Recently Joined records, Quick Launch shortcuts and onboarding support portals.
- Policy PDFs are uploaded through the Content > Policies form, stored under `/uploads/`, and rendered in an in-app full-screen document viewer. Employees can View or Download an approved PDF from the Essential policies cards; the Policy register remains informational.
- The document viewer uses Poppler (`pdfinfo`, `pdftotext` and `pdftoppm`) to render pages and provide document search. Search shows a precise occurrence count, highlights every matching word, moves to the next match with Enter, and marks the active occurrence.
- Global search includes matching policy document pages in addition to the existing intranet content. The server exposes `/api/documents/search`, `/api/documents/highlights` and `/api/documents/page` for the viewer and search experience.
- Policy register metadata shows the PDF’s actual last-uploaded modified timestamp in the Cairo time zone. The timestamp is derived from the uploaded file rather than entered manually; policies without an uploaded PDF show `No file uploaded`.
- The onboarding Need help? directory has consistent routes for IT Support, People & HR, Administration and Finance. It links to the appropriate Company Portal, SolarWinds Service Desk or MOHR route, and exposes the approved IT and People Team email contacts.
- `supportPortals` defines the three employee destinations: Company Portal (Administration, Finance & People Team), SolarWinds Service Desk (IT Support), and MOHR (Payslips & HR topics). Administrators configure each portal’s name, description, safe destination link and SVG icon through Administration > Apps; an unconfigured portal displays `Link coming soon` to employees.

## Production follow-up

- Replace demo roles with Azure AD or Google Workspace SSO and real server-side RBAC.
- Connect policy cards to approved document storage and add policy publishing/editing controls to the CMS.
- Replace demo social/RSS data with server-side feed integrations.
- Add persistent database storage, audit logs, malware-safe uploads and policy approval workflows.
- Add automated accessibility and browser E2E tests before launch.

## Current portal destinations and live content

- The shared destination navigation (`public/destination-nav.js`) exposes Home, Main Apps, Announcements, Recently Joined, Company news, Social Media, Moments, Knowledge Hub, Events & key dates, Whistleblower, and New Si-Warians on every main employee-facing page.
- Dedicated pages render live dashboard data through `public/portal-pages.js`: `/apps.html`, `/announcements.html`, `/social-media.html`, `/moments.html`, `/knowledge-hub.html`, and `/events.html`.
- `/news.html` and the dashboard company-news module use `/api/company-news` to load and cache the latest official Si-Ware news. The news carousel advances automatically while retaining explicit previous/next controls.
- The Social Media page links to Si-Ware's official LinkedIn, Facebook, YouTube, and website channels; its YouTube entries use `/api/youtube/latest`.
- Moment image cards use a contrast scrim over photography so captions remain readable, and destination pages provide a horizontally scrollable navigation treatment at narrow widths.

## Current shared employee UI (October 2026)

- The employee-facing shell uses a compact two-row desktop header. The first row contains the linked official Si-Ware logo plus an `Intranet` label; the right side contains the intranet search trigger, theme control, restricted Admin CMS action, and the signed-in employee photo, name, and access level. The second row contains all primary destinations with a clear active state.
- `public/destination-nav.js` owns the shared dedicated-page header, full employee profile display, search panel, navigation active state, and shared footer. Do not create page-specific copies of these controls.
- The header search trigger appears before the theme control. It opens an inline, right-anchored search field and results panel; the older dedicated-page search field was removed. It is keyboard accessible and closes with Escape or outside click.
- The dashboard profile and dedicated-page profile display `Marwan Elafifi` with `Full Access` and use the configured uploaded avatar when available. The user identity is also refreshed from `/api/dashboard` by `destination-nav.js`.
- Main Apps are a one-row carousel rather than a grid. It advances one card at a time automatically, pauses while an app card is hovered or focused, and has previous/next controls aligned immediately beside the visible first/last card. It intentionally has no section heading, search field, scroll rail, or divider lines.
- Dedicated destination pages use the compact intro spacing in `public/dedicated-standard.css`. This includes the generic destinations and the special policy/news templates: Whistleblower, Recently Joined, New Si-Warians, and Company News.
- `public/news-shifter.js` waits for the requested official news image to load and decode before showing its slide. It preserves source order, starts on the first source story, and does not substitute a later story when an image is temporarily unavailable.
- The Social Media destination is a single connected directory card with four separate official links: LinkedIn, Facebook, YouTube, and the Si-Ware website. Its channel icons are compact SVGs, except the website entry which uses the official `public/Icon.png` Si-Ware mark. The directory has a short staggered entrance and precise hover/focus feedback; it honors `prefers-reduced-motion`.
- `public/shared-footer.css` styles the universal footer. On desktop it has three zones: left `© 2026 Si-Ware Systems · Internal use only`, centered `For technical support, contact ithelpdesk@si-ware.com` (a `mailto:` link), and right compact LinkedIn/Facebook/YouTube/Si-Ware social icons. It stacks cleanly on mobile. Existing policy-page ownership/review details are preserved at the left.
- When editing shared navigation, social channels, search, or footer behavior, update `public/destination-nav.js`, `public/header-search.css`, `public/dedicated-standard.css`, and/or `public/shared-footer.css` instead of patching individual routes. Validate with `node --check public/destination-nav.js`, `git diff --check`, the Impeccable layout detector, and `docker compose up -d --build`.
