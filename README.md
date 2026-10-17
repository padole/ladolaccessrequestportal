# LADOL Access Portal

Site-access request portal. A **Flask JSON API** (`myapp/`) serves a **React + TypeScript** single-page app (`frontend/`).

## Roles

There is one login page for everyone. Every account has one role, assigned by an Access Controller under **Users & roles**:

| Role | Value | Can do |
|------|-------|--------|
| User | `user` | Create, draft, submit and track their own access requests. |
| Access Admin | `access_admin` | Gate staff. Read-only view of **every** submitted request and its status, with an entry check on each request. Cannot create, edit or review requests, or manage users. |
| Access Controller | `access_controller` | Everything a User can do, plus approve / reject / terminate / reopen any request, and manage users and their roles. |

Safeguards: an Access Controller cannot change their own role, disable or delete themselves, or review their own request. The last active Access Controller cannot be demoted, disabled or deleted. Self-registration always creates a `user`.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env          # then fill in SECRET_KEY, DATABASE_URL, mail settings
flask --app app init-db       # creates tables / upgrades the old schema in place
flask --app app create-controller you@example.com   # only needed if you have no Access Controller yet
```

`init-db` is safe to run more than once. On an existing database from the old app it adds the new columns, allows draft requests, and turns each row of the old `admin` table into a normal user with the Access Controller role. They keep their password and sign in on the normal login page. After that the old `admin` table is no longer used.

Other CLI helpers: `flask --app app set-role <email> user|access_admin|access_controller`.

## Development

Run the API and the Vite dev server side by side. Vite proxies `/api` to Flask:

```bash
python app.py                 # API on http://127.0.0.1:8082
cd frontend && npm install && npm run dev   # UI on http://localhost:5180
```

## Production

```bash
cd frontend && npm ci && npm run build      # outputs frontend/dist
```

Flask serves `frontend/dist` and falls back to `index.html` for client-side routes. Run it behind a WSGI server using `wsgi:application` (e.g. `gunicorn wsgi:application`) with `SESSION_COOKIE_SECURE=true` over HTTPS. `wsgi.py` refuses to start without a real `SECRET_KEY`.

For a free review deployment, see [docs/DEPLOY_PYTHONANYWHERE.md](docs/DEPLOY_PYTHONANYWHERE.md).

## Notes

- Uploaded documents are stored in `UPLOAD_FOLDER` (default `./uploads`, outside the web root). They can only be downloaded by the request owner, an Access Controller or an Access Admin.
- Mail failures are logged and never break a request. Leave `MAIL_SERVER` empty to disable sending.
