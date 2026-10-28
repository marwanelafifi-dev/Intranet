# Si-Ware Global Intranet

A Docker-local, zero-dependency prototype of the Si-Ware Systems intranet and its admin experience.

## Run locally

```powershell
docker compose up --build
```

Open `http://localhost:8081/login.html`. Admin changes are written to `data/intranet.json`, which is mounted from the host so data survives container recreation. Starter content lives in `data/seed.json`.

## Safe Ubuntu updates

The published intranet keeps its live content outside the container in `data/`. Before updating the application on Ubuntu, back up `data/intranet.json`, `data/uploads/`, and `data/audit trail archive/` (when present). Then update only the application source and rebuild the service; do not delete, replace, or copy `data/` from a development machine. The `data/intranet.json` file contains all admin-edited text and links, while `data/uploads/` contains uploaded PDFs and other media. Both survive `docker compose up -d --build` because they are host-mounted.

Audit and browser-activity records remain in the active trail for 90 days from server receipt. On the first data load each UTC day, older records are added to one compressed JSON Lines archive per calendar quarter, named `audit-trail-YYYY-QN.jsonl.gz`, before they are removed from `intranet.json`. Each quarter combines audit and browser-activity events. Docker mounts the entire `./data` folder, so on Ubuntu the archives persist beside `intranet.json` at `<compose-directory>/data/audit trail archive/`. Back up this folder with the data file; archived events are not included in the active Audit Trail search or CSV export. Archive files are not automatically deleted. The current JSON storage is still a prototype and needs transactional storage before a 1,000-user production deployment.

## Sign-in

For local Docker use, set `LOCAL_ADMIN_EMAIL` and `LOCAL_ADMIN_PASSWORD` in an untracked `.env` file. The local administrator can sign in on the login page and access the admin workspace. If Google Workspace credentials are configured, Google sign-in appears as the primary option. Workspace roles are assigned from `GOOGLE_ADMIN_EMAILS` and the admin access list.

Authentication uses an HTTP-only, same-site session cookie. Set `SECURE_COOKIES=true` when serving over HTTPS. Sessions are kept in memory for up to eight hours, so restarting the container signs users out. Local credentials and memory-backed sessions are intended for this Docker environment; a production deployment needs a managed identity provider and shared session storage.

## Announcement notifications and email

In **Administration > Notifications**, administrators approve Google Group addresses, choose a default group, and enable or disable the in-app bell and email globally. Enter groups such as `eg.team@si-ware.com` and `everyone@si-ware.com` only after confirming their membership in Google Admin. In **Administration > Announcements**, every new announcement selects one approved group; editors may switch to another approved group but cannot turn notification channels off individually. The intranet checks each signed-in employee's live Google Group membership when loading announcements. Group members and explicitly named CC/BCC recipients with signed-in Si-Ware accounts can see the announcement and its bell; other nonmembers cannot. When email is globally enabled, the selected group is the sole To recipient. Optional CC and BCC addresses can be outside the group and receive email without changing the group itself. When email is disabled, the editor shows an in-app-only note. Older untargeted announcements without a group stay visible but never deliver a bell or email; older announcements with saved recipients are withheld from employees until assigned an approved group. An announcement published while global email is off is marked skipped and will not be sent later when email is reenabled.

Email sends from `intranet@si-ware.com` through Gmail SMTP. Before opening the Notifications page, add a unique long `NOTIFICATION_SECRET_KEY` to the untracked Ubuntu `.env` and restart the service. An administrator with both **Manage settings** and **Notifications** page access can then save the Gmail App Password in the UI and enable or disable email delivery at any time. The password is encrypted on the server and stored in `data/notification-secrets.json`; it is never returned to the browser. Keep that file out of Git and Docker images, restrict it to the service account, include it in backups, and do not change `NOTIFICATION_SECRET_KEY` unless you intend to enter the app password again.

## Google Workspace content sync

Configure sources in **Administration > Settings > Google Workspace content sync**, not in `.env`. Select employee/intern OUs from the live Google list; Guests and Consultants are not selectable. The 3rd Floor Meeting Room (`c_1886rrgqhtprciftkps7n738rs2fo@resource.calendar.google.com`) and Recreational Area Space (`c_188bj799if2eoj4el09lt4nbmlrmg@resource.calendar.google.com`) are preselected. Sync remains off until an administrator enables and saves it. Use **Sync now** for an immediate check. Grant the delegated service account these four read-only scopes: `https://www.googleapis.com/auth/admin.directory.user.readonly`, `https://www.googleapis.com/auth/admin.directory.orgunit.readonly`, `https://www.googleapis.com/auth/calendar.events.readonly`, and `https://www.googleapis.com/auth/admin.directory.group.member.readonly`. The last scope allows notification audience checks for Google Groups; the delegated administrator needs Groups read access.

If saving notification groups reports that Google Group access could not be verified, edit the **existing** domain-wide delegation entry for the same service account numeric client ID and add `https://www.googleapis.com/auth/admin.directory.group.member.readonly` alongside the existing scopes. Keep the user, OU, and calendar scopes. Confirm each proposed group email in Google Admin > Directory > Groups and confirm that `GOOGLE_SYNC_SUBJECT` is an administrator permitted to read Groups. Retry saving in Administration > Notifications after the delegation change takes effect. The app requests this scope automatically; adding it to `.env` is unnecessary.

Google sign-in alone does not provide directory or calendar data. To automatically publish new accounts from selected OUs to Recently Joined and events from selected resource calendars to Events & key dates:

1. Enable the **Admin SDK API** and **Google Calendar API** in a Google Cloud project. Create a service account with domain-wide delegation and download its JSON key. Keep the key only at `./secrets/google-workspace.json` on the Docker host (this folder is ignored by Git and excluded from the image), and restrict its file permissions.
2. In Google Admin console → Security → Access and data control → API controls → Domain-wide delegation, authorize the service account's **numeric client ID** for the four read-only scopes listed above. Use a delegated admin account that can read the directory and Google Groups and has access to the selected resource calendars with event details.
3. Add the following to the untracked `.env`. Choose the OU paths and resources in Administration after starting the app. Do not paste the service-account key into `.env` or Git.

```dotenv
GOOGLE_SYNC_SUBJECT=directory-sync@si-ware.com
GOOGLE_RECENTLY_JOINED_LOOKBACK_DAYS=30
# Optional Workspace custom fields; the date must be YYYY-MM-DD.
GOOGLE_HIRE_DATE_FIELD=Employment.hireDate
GOOGLE_DIVISION_FIELD=Employment.division
```

The server polls every 15 minutes after sync is enabled. Google Directory search results can lag, so new accounts may not appear immediately. Only active, non-guest users directly in the selected OUs are imported; child OUs are not included unless selected, and accounts created more than the configured lookback ago are not backfilled. Imported cards are matched by Google's stable user ID or company email. Each sync refreshes Google-sourced profile fields; Division (set by an administrator) and LinkedIn (set by the employee) are intranet-owned and preserved. The Workspace account creation timestamp is **not** used as an employment start date: without the optional hire-date field, Joined remains “To be confirmed.” Employment type is inferred for the four named Egypt employment/intern OUs; other missing HR details require manual completion in Administration. Imported cards appear to employees automatically, so select only OUs approved for employee-wide publication.

Calendar sync expands recurring events and shows only the chosen calendars' non-private events in a rolling window from seven days ago through 90 days ahead. All employees see only title, date/time, and room. Event descriptions, approved HTTPS meeting links, and attachments are returned only when the server confirms the signed-in employee is invited to that event; raw attendee emails are neither stored nor sent to browsers. Private and confidential events are excluded, and manually entered events are left alone. A successful refresh removes cancelled or out-of-window imported events; a failed resource read leaves that resource's previous events untouched. Configure only calendars whose public schedule metadata is approved for employee-wide visibility. This is read-only: the intranet never changes Google users or calendars. Restart the container after changing `.env` or the key. See [Google's Directory search documentation](https://developers.google.com/workspace/admin/directory/v1/guides/search-users), [domain-wide delegation setup](https://developers.google.com/identity/protocols/oauth2/service-account), and [Calendar events API](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).

For a room or other Google Workspace resource, use its `resourceEmail` as the calendar ID—not its display name or internal resource ID. [Google documents this mapping](https://developers.google.com/workspace/calendar/api/concepts/domain).

## Role access

Administration → Roles separates employee-page access from Administration access. `intranet.*` permissions control the employee-facing page routes and corresponding dashboard/search content. `admin.access` opens the Admin Panel only when the role also has an allowed Administration page (`page.*`) and its required capability, such as `content.edit` or `audit.view`. Administration actions remain separate. My profile is available to every signed-in user. Existing saved roles receive the previously available intranet pages during the one-time permissions migration; administrators can then narrow each role.

## Authentication routes

- `GET /api/auth/options` reports the available sign-in methods.
- `POST /auth/local` signs in the configured local administrator.
- `GET /auth/google` starts the existing Google Workspace OAuth flow.
- `GET /api/auth/me` returns the active identity and permissions.
- `POST /auth/logout` ends the active session.
