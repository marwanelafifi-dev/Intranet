# Si-Ware Intranet — Project Notes

## Local runtime

- Start the application with `docker compose up --build -d`.
- The app is available at `http://localhost:8081`.
- Persistent dashboard data is stored in `data/intranet.json`; seed defaults are in `data/seed.json`.

## Administration workspace

- The full-screen Admin CMS manages dashboard content, Recently Joined colleagues, layout, apps, and the New Si-Warians experience.
- Policies are managed only in **New Si-Warians → Policies**. The generic Content tab is limited to announcements and Knowledge Hub sessions.
- New Si-Warians also manages support portals. Its list and editor are kept together in the full-screen split workspace.

## Recently Joined

- Employee photos use `photoUrl` when present and fall back to initials if unavailable or unable to load.
- The editor captures department and division; legacy `team` values remain only as a compatibility fallback for existing records.

## New Si-Warians policies

- The Essential Policies section renders its live data from `/api/dashboard`.
- Each policy card contains its summary, owner, audience, version, update status, and PDF actions; there is no separate policy register.

## Theme and interaction behavior

- Dark theme rules live in `public/theme-toggle.css`, with final ordering overrides in `public/dark-mode-fixes.css` for social feed surfaces.
- Company portal cards have explicit dark-theme colors.
- The Explore prompt fades out over 650 ms when the Knowledge Hub enters view, and stays dismissed for the browser session.
