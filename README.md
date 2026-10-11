# Si-Ware Global Intranet

A Docker-local, zero-dependency prototype of the Si-Ware Systems intranet and its no-code admin experience.

## Run locally

```powershell
docker compose up --build
```

Open `http://localhost:8081`. The API writes admin changes to `data/intranet.json`, which is mounted from the host so data survives container recreation. The seeded source of truth is `data/seed.json`.

## Demo roles

Use the avatar menu to switch between **Admin** and **Employee**. The Admin CMS is intentionally only rendered for the Admin role. Production deployment should replace this demo role switch with Azure AD or Google Workspace token validation and server-side RBAC.

## API

- `GET /api/dashboard` — dashboard data and current demo user
- `PATCH /api/dashboard` — persists dashboard settings (requires `x-demo-role: ADMIN`)
- `POST /api/sessions` — adds a Knowledge Hub session (requires admin)
- `POST /api/announcements` — adds an announcement (requires admin)

This starter keeps its API intentionally small and dependency-free for local Docker use. External RSS/social providers are represented by refresh-ready feed metadata and safe demo cards; connect the listed sources via a server-side aggregator before production.
