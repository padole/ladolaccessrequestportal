# Deploying to PythonAnywhere (free plan)

This puts the portal at `https://<username>.pythonanywhere.com` for team review.
The examples use the username `padole`; replace it with yours everywhere.

**Before you start**

- This copies your **current local MySQL data** (users, requests and uploaded documents) to the site. It's on the public internet, so only share the link with people who may see that data.
- Email is off on the free plan (outbound SMTP is blocked), so password-reset emails won't send. Users sign in with their existing passwords.
- The free plan stops the site unless you click **Run until 3 months from today** on the **Web** tab every 3 months.

## 1. Publish the frontend build (on your PC)

The free plan can't build the React app, so build it on your PC and attach it to a GitHub Release. In PowerShell, from the project folder:

```powershell
.\scripts\publish-frontend.ps1
```

This needs Node.js and the GitHub CLI (`gh`, signed in). Run it again whenever the frontend changes.

## 2. Export your local data (on your PC)

In Git Bash, from the project folder (adjust the XAMPP path if yours differs):

```bash
mkdir -p backups/deploy
/c/xampp/mysql/bin/mysqldump.exe -h 127.0.0.1 -u root --single-transaction --no-tablespaces --skip-add-locks   --ignore-table=accessportalv3.admin --ignore-table=accessportalv3.alembic_version   accessportalv3 > backups/deploy/accessportal.sql
python -c "import shutil; shutil.make_archive('backups/deploy/uploads', 'zip', 'uploads')"
```

This writes `backups/deploy/accessportal.sql` (users and requests) and `backups/deploy/uploads.zip` (uploaded documents). `backups/` is git-ignored, so this data never goes to GitHub.

## 3. Create the account and database

1. Sign up for a free **Beginner** account at <https://www.pythonanywhere.com>.
2. Open the **Databases** tab:
   - Set a **MySQL password** (you'll need it in step 4).
   - Under **Create a database**, enter `accessportal`. Its full name will be `padole$accessportal`.
   - Note the **Database host address**, e.g. `padole.mysql.pythonanywhere-services.com`.

## 4. Get the code and import the data (Bash console)

Open **Consoles → Bash** and run:

```bash
git clone https://github.com/padole/ladolaccessrequestportal.git
cd ladolaccessrequestportal
mkvirtualenv --python=python3.12 ladol      # use the newest python3.x PythonAnywhere offers
pip install -r requirements.txt
bash scripts/fetch_frontend.sh               # downloads the build from step 1
python -c "import secrets; print(secrets.token_urlsafe(48))"   # copy the output for SECRET_KEY
nano .env
```

Paste this into `.env`, filling in your values (Ctrl+O, Enter, Ctrl+X to save and exit):

```ini
SECRET_KEY=<the long random string from above>
DATABASE_URL=mysql+mysqlconnector://padole:<mysql-password>@padole.mysql.pythonanywhere-services.com/padole$accessportal
MAIL_SERVER=
FRONTEND_URL=https://padole.pythonanywhere.com
SESSION_COOKIE_SECURE=true
```

If your MySQL password contains `@`, `:`, `/` or `#`, either choose a password without them or URL-encode those characters.

Now upload the two files from step 2. Open the **Files** tab, go to `/home/padole/ladolaccessrequestportal/`, and use **Upload a file** for `accessportal.sql` and `uploads.zip`. Back in the Bash console:

```bash
mysql -u padole -h padole.mysql.pythonanywhere-services.com -p 'padole$accessportal' < accessportal.sql
python -m zipfile -e uploads.zip uploads
rm accessportal.sql uploads.zip           # don't leave personal data lying around
flask --app app init-db                   # checks the schema; prints the changes it makes, if any
```

The `mysql` command asks for the MySQL password from step 3.

## 5. Create the web app (Web tab)

1. **Add a new web app** → **Next** → **Manual configuration** (not "Flask") → choose the same Python version as the virtualenv.
2. In the **Code** section:
   - **Source code:** `/home/padole/ladolaccessrequestportal`
   - **Virtualenv:** `/home/padole/.virtualenvs/ladol`
3. Click the **WSGI configuration file** link, delete everything in it, and paste:

   ```python
   import sys

   path = '/home/padole/ladolaccessrequestportal'
   if path not in sys.path:
       sys.path.insert(0, path)

   from wsgi import application  # noqa: E402,F401
   ```

   Save.
4. Optional but faster: under **Static files**, add URL `/assets/` with directory `/home/padole/ladolaccessrequestportal/frontend/dist/assets`.
5. Under **Security**, turn on **Force HTTPS**.
6. Click the big green **Reload** button, then open `https://padole.pythonanywhere.com`.

If the page shows an error, open the **error log** link on the Web tab. The most common causes are a typo in `DATABASE_URL` or a missing `SECRET_KEY`.

## Send to reviewers

Everyone signs in with the same email and password they use locally. New reviewers can register (they start as **User**), and an Access Controller can change their role under **Users & roles** so they can try the Access Admin or Access Controller views.

## Updating the code

The site's database is separate from your local one after the import. Changes made on the site stay there; to replace the site's data with your local data again, repeat steps 2 and the import part of step 4.


On your PC: commit and `git push`. If the frontend changed, also run `.\scripts\publish-frontend.ps1`.

Then in a PythonAnywhere Bash console:

```bash
cd ~/ladolaccessrequestportal
git pull
workon ladol && pip install -r requirements.txt   # only needed if requirements.txt changed
bash scripts/fetch_frontend.sh                    # only needed if the frontend changed
```

Then click **Reload** on the Web tab. Database schema changes are applied automatically when the app starts.
