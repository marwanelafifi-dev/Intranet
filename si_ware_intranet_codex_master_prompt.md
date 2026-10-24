# Si-Ware Systems Global Intranet — AI Development Master Prompt & PRD

> **INSTRUCTIONS FOR CODEX / AI DEVELOPER:**
> You are acting as a Lead Full-Stack Engineer and UI/UX Architect. Your task is to implement the **Next-Generation Si-Ware Systems Global Intranet and CMS Control Panel** based on the technical specifications, data schemas, UI hierarchy, and development roadmap outlined below.
> 
> Build all components using modern web technologies (e.g., React/Next.js or clean HTML5/CSS3/JavaScript with Tailwind CSS), ensuring complete responsiveness, accessibility (WCAG 2.1 AA), dynamic data rendering, and a modular component layout.

---

## 1. Executive Context & System Goals

The objective is to replace Si-Ware Systems' legacy intranet portal (previously built on Overdrive) with a modern, high-performance, single-sign-on (SSO) corporate hub. 

### Key System Objectives:
* **Visual Modernization:** Clean, brand-aligned (Si-Ware blue palette), card-based layout with dark/light mode toggle.
* **Quick Launch Pad (App Dock):** High-priority top toolbar providing 1-click SSO redirection to 12 core operational applications.
* **Si-Ware Knowledge Hub:** An interactive digital library for technical engineering sessions featuring inline video modals (`.mp4`), document decks (`.pdf`), speaker tags, and instant filtering.
* **Dynamic Feeds & Widgets:** Aggregated technology RSS news, NeoSpectra YouTube feed, Si-Ware Facebook updates, team photo carousel ("Moments"), announcements banner, and company events calendar.
* **100% No-Code UI Admin Control Panel:** A built-in CMS allowing non-technical admins (HR, Marketing, IT) to modify app links, post announcements, upload knowledge hub sessions, reorder dashboard widgets, and manage RSS feeds directly from the UI.

---

## 2. Technical Architecture & Component Hierarchy

### 2.1 Layout Component Hierarchy

```
+---------------------------------------------------------------------------------------------------------+
| [Header] Logo | Navigation Links | Global Search Bar | Theme Toggle | Notifications | Profile Drawer    |
+---------------------------------------------------------------------------------------------------------+
| [App Dock] 🚀 Quick Launch Pad (12 Standardized App Shortcuts with Tooltips)                             |
+--------------------------------------------------------------------+------------------------------------+
| [Widget] 📢 Hero Banner & Priority Announcements                   | [Widget] 📰 Industry RSS News      |
| ("Zest for Life", Promotions, Leadership Notes)                    | (Multi-feed selector & cards)      |
+--------------------------------------------------------------------+------------------------------------+
| [Widget] 🎓 Si-Ware Knowledge Hub (Sessions Library)               | [Widget] 📸 Moments Gallery        |
| (Search bar, Tag filters, Interactive session table, Video modal)  | (Team photo carousel / grid)       |
+--------------------------------------------------------------------+------------------------------------+
| [Widget] 🎥 NeoSpectra Solutions (YouTube Channel Feed)            | [Widget] 📘 Si-Ware Facebook Feed  |
| (Customer impact studies, Animal Feed & Forage product demos)      | (Live public posts feed)           |
+--------------------------------------------------------------------+------------------------------------+
| [Widget] 📅 Company Events & Appraisals Calendar                                                        |
+---------------------------------------------------------------------------------------------------------+
| [Floating / Drawer] ⚙️ Admin Control Panel (No-Code CMS Overlay for authorized users)                   |
+---------------------------------------------------------------------------------------------------------+
```

---

## 3. Detailed Component Specifications

### 3.1 App Dock (Quick Launch Pad)
Provide a standardized 12-app grid with hover tooltips, smooth hover scaling, and SSO redirect endpoints:
1. **Gmail:** Corporate Email (`https://mail.google.com`)
2. **ClickUp:** Project & Task Management
3. **Document Drive:** Cloud Document Repositories
4. **IT Support Desk:** Helpdesk Ticketing System
5. **MOHR:** HR Self-Service Portal
6. **Contacts Directory:** Internal Employee Phonebook
7. **Org Chart:** Organizational Structure & Team Tree
8. **Time Tracker:** Attendance & Timesheet Logging
9. **Arena PLM:** Product Lifecycle Management (Engineering Parts/BOMs)
10. **NetSuite ERP:** Enterprise Financials & Supply Chain
11. **Si-Brain:** Si-Ware’s main AI platform, combining company knowledge with ClickUp, Google Drive, Gmail, and Google Calendar
12. **Si-Bot:** AI chat and specialist agents for questions, guidance, and lightweight files

### 3.2 Si-Ware Knowledge Hub
* **Metadata Schema:**
  ```json
  {
    "id": "skh-001",
    "title": "Fundamentals of Patenting & Si-Ware Patents Portfolio",
    "presenter": { "name": "Bassem Mortada", "avatar": "/avatars/bassem.jpg" },
    "date": "2025-03-12",
    "category": "Patents",
    "outline": "Introduction to Patents & Patentability, Application Process & Structure.",
    "presentationDeckUrl": "/docs/patents_part1.pdf",
    "recordingUrl": "/media/patents_part1.mp4"
  }
  ```
* **UI Features:**
  * Search input filtering by title, presenter name, or category tags (*Photonics, Patents, MEMS, AI*).
  * Clicking "Watch Recording" opens an in-app video modal player with `.mp4` streaming support.
  * Clicking "Presentation Link" opens an inline PDF viewer preview.

### 3.3 Industry & Technology News (RSS Aggregator)
* **Default Feed Sources:**
  * *Optical Spectroscopy* (Nature.com subject feeds)
  * *Semiconductor Digest*
  * *Dairyland Labs Press Releases*
  * *MDPI Agriculture Journal*
  * *Journal of Near Infrared Spectroscopy*
  * *ROHM Sensors / MEMS Feeds*
* **UI Features:** Dropdown feed selector to instantly switch active news feeds without page reload.

### 3.4 Admin Control Panel & CMS (No-Code UI)
* Accessible via a sticky "⚙️ Admin CMS" toggle button visible only to users with `role === "ADMIN"`.
* **CMS Modules:**
  * **App Dock Manager:** Add/remove shortcuts, upload custom app icons, edit target URLs, and reorder icons.
  * **Announcement Editor:** WYSIWYG rich text editor with publish scheduling and priority banners.
  * **Knowledge Hub Publisher:** Upload session decks (PDF), video URLs (`.mp4`), and speaker metadata.
  * **Layout Configurator:** Drag-and-drop section reordering and widget visibility toggles.

### 3.5 Onboarding Module ("New Si-Warian!")

The New Si-Warian! experience is an employee-facing onboarding destination for first-week actions, mandatory policy acknowledgement, support routing and relevant work tools. Administration manages its content; employees can only complete their own actions and view their own acknowledgement status.

* **Interactive First-Week Checklist**
  * Show five first-week tasks: Gmail/Drive login, 2-Step Verification, 30-day manager sync, orientation booking and Knowledge Hub exploration.
  * Persist each task's completion state against the authenticated employee profile in the application database, not only in browser storage. The UI shows the employee's current completion count (for example, `3 of 5 complete`).
  * Completing a task is idempotent and recorded once per employee. The same state must follow the employee across devices and sessions.
  * Each task may expose an independently configured resource URL and/or attachment, with clear labels. Attachments retain the original filename and extension.

* **Policy Acknowledgement Audit Engine**
  * Require acknowledgement of the current versions of Code of Conduct (v3.2), IT Security Policy (v1.2), Attendance & Leave (v4.0), and Health & Safety (v2.1), or of their administrator-managed successors.
  * Before confirmation, require the employee to open every published mandatory policy PDF. Provide inline document viewing, full-document navigation/search where supported, and direct download actions.
  * Record an immutable acknowledgement snapshot after Google Workspace SSO authentication: `{ user_id, email, timestamp_utc, policy_id, policy_version, policy_document_key, confirmation_statement, ip_address }`. The record must include every policy covered by the acknowledgement and the acknowledgement-content version.
  * Capture the client IP only through a trusted reverse proxy / server connection context; restrict acknowledgement audit records to authorized administrators and define a retention period with Legal/People Operations.
  * A changed policy version, document, or acknowledgement text invalidates the previous acknowledgement and requires a new sign-off. The employee-facing confirmation statement is versioned and stored with the audit record.

* **Helpdesk & Portal Routing Matrix**
  * Provide direct, safe SSO-ready routes to SolarWinds Service Desk (`ithelpdesk@si-ware.com`), MOHR HR Portal (`human.resources@si-ware.com`), and the Administration and Finance portals.
  * Every route displays its owner, purpose, destination state and a clear recovery path when the destination is not yet configured (for example, `Contact IT Support`).
  * Administrators manage portal names, descriptions, approved URLs and icons from the New Si-Warians workspace; external destinations open in a separate tab with safe link attributes.

* **Quick Launch Tools Dock Integration**
  * Recommend onboarding-relevant tools from the central Quick Launch catalog using the authenticated employee's role and department. Do not duplicate the complete dock on the onboarding page.
  * The onboarding page surfaces only the tools required for the employee's first actions; the dashboard Quick Launch remains the full tool directory.
  * Recommendations must have sensible defaults when role or department information is unavailable, and must not expose tools the employee is not authorized to use.

---

## 4. 12-Week Development Roadmap

```
[Phase 1: Architecture & Design Tokens] ──> [Phase 2: Core UI Components] ──> [Phase 3: CMS & Feeds Integration] ──> [Phase 4: QA, Security & Launch]
             (Weeks 1 - 2)                             (Weeks 3 - 5)                     (Weeks 6 - 9)                       (Weeks 10 - 12)
```

| Phase | Timeline | Core Deliverables & Milestones |
| :--- | :--- | :--- |
| **Phase 1: Foundations** | Weeks 1–2 | • Brand design tokens & dark/light theme setup.<br>• Data schemas for Knowledge Hub, RSS, and App Dock.<br>• SSO (Azure AD / Google Workspace) authentication architecture. |
| **Phase 2: Core Frontend UI** | Weeks 3–5 | • Sticky Navbar, Search Bar & 12-App Dock component.<br>• Hero Banner & priority announcements widget.<br>• Si-Ware Knowledge Hub UI with search & inline `.mp4` video player modal.<br>• Moments photo gallery, YouTube & Facebook social widgets. |
| **Phase 3: CMS & Integrations** | Weeks 6–9 | • Dynamic RSS parser integration with feed tab switcher.<br>• Global search indexing engine.<br>• Full No-Code Admin Control Panel UI (App Dock editor, Knowledge Hub publisher, Announcement editor).<br>• Drag-and-drop dashboard widget layout configurator. |
| **Phase 4: QA & Rollout** | Weeks 10–12 | • Historical data & session video migration from old intranet.<br>• Performance optimization (sub-2 second load time via lazy-loading & CDN).<br>• End-to-end security audit & role-based access control (RBAC) testing.<br>• Staff launch & Admin training. |

---

## 5. Non-Functional Requirements & Code Standards

1. **Performance:** Page load time under 2.0 seconds with lazy loading for all heavy media, photo galleries, and video previews.
2. **Responsiveness:** Full layout adaptation across 4K displays, standard laptops, tablets, and mobile web viewports.
3. **Security:** Secure tokenized SSO authentication, HTTPS transmission, and role-based access control (RBAC) restricting admin routes.
4. **Accessibility:** WCAG 2.1 AA compliant styling, high contrast text ratios, and full keyboard navigation support.
