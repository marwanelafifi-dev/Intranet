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
11. **Si-Brain:** Internal R&D AI Knowledge Assistant
12. **Si-Bot:** Automated Support Workflow Bot

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