# Si-Ware Global Intranet

A Docker-local, zero-dependency prototype of the Si-Ware Systems intranet and its admin experience.

## Run locally

```powershell
docker compose up --build
```

Open `http://localhost:8081/login.html`. Admin changes are written to `data/intranet.json`, which is mounted from the host so data survives container recreation. Starter content lives in `data/seed.json`.

Audit and browser-activity records remain in the active trail for 90 days from server receipt. On the first data load each UTC day, older records are added to one compressed JSON Lines archive per calendar quarter, named `audit-trail-YYYY-QN.jsonl.gz`, before they are removed from `intranet.json`. Each quarter combines audit and browser-activity events. Docker mounts the entire `./data` folder, so on Ubuntu the archives persist beside `intranet.json` at `<compose-directory>/data/audit trail archive/`. Back up this folder with the data file; archived events are not included in the active Audit Trail search or CSV export. Archive files are not automatically deleted. The current JSON storage is still a prototype and needs transactional storage before a 1,000-user production deployment.

## Sign-in

For local Docker use, set `LOCAL_ADMIN_EMAIL` and `LOCAL_ADMIN_PASSWORD` in an untracked `.env` file. The local administrator can sign in on the login page and access the admin workspace. If Google Workspace credentials are configured, Google sign-in appears as the primary option. Workspace roles are assigned from `GOOGLE_ADMIN_EMAILS` and the admin access list.

Authentication uses an HTTP-only, same-site session cookie. Set `SECURE_COOKIES=true` when serving over HTTPS. Sessions are kept in memory for up to eight hours, so restarting the container signs users out. Local credentials and memory-backed sessions are intended for this Docker environment; a production deployment needs a managed identity provider and shared session storage.

## Role access

Administration → Roles separates employee-page access from Administration access. `intranet.*` permissions control the employee-facing page routes and corresponding dashboard/search content. `admin.access` opens the Admin Panel only when the role also has an allowed Administration page (`page.*`) and its required capability, such as `content.edit` or `audit.view`. Administration actions remain separate. My profile is available to every signed-in user. Existing saved roles receive the previously available intranet pages during the one-time permissions migration; administrators can then narrow each role.

## Authentication routes

- `GET /api/auth/options` reports the available sign-in methods.
- `POST /auth/local` signs in the configured local administrator.
- `GET /auth/google` starts the existing Google Workspace OAuth flow.
- `GET /api/auth/me` returns the active identity and permissions.
- `POST /auth/logout` ends the active session.
