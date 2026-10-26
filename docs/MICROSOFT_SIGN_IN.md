# Sign in with Microsoft 365

Staff with an `@ladol.com` Microsoft 365 account can sign in with the **Sign in with Microsoft** button on the sign-in page. Microsoft handles their password and MFA; the portal never sees it.

- An existing portal account with the same email is linked automatically. Its role and requests stay as they are, and its password keeps working.
- Staff without a portal account get one on their first Microsoft sign-in, with the **User** role and company **Ladol**. If Microsoft 365 has no job title or phone for them, they are asked for it once.
- Accounts from other organisations, other email domains, and disabled portal accounts are refused.

The button only appears once the three `MS_` values below are set.

---

## Part 1: Register the app in Microsoft Entra ID

You need a Microsoft 365 account that can register apps. That is usually a **Global Administrator**, **Application Administrator** or **Cloud Application Administrator**. If you aren't one, send this part to your IT admin.

### 1. Open App registrations

1. Go to **https://entra.microsoft.com** and sign in with your `@ladol.com` admin account.
2. In the left menu, click **Identity** → **Applications** → **App registrations**.
   (In the Azure portal, https://portal.azure.com, the same page is under **Microsoft Entra ID** → **App registrations**.)
3. Click **+ New registration** at the top.

### 2. Fill in the registration form

1. **Name:** `LADOL Access Portal`. Staff see this name on the Microsoft sign-in screen.
2. **Supported account types:** select **Accounts in this organizational directory only (… only - Single tenant)**.
3. **Redirect URI (optional):**
   - In the **Select a platform** dropdown, choose **Web**. Don't choose "Single-page application".
   - In the box next to it, enter
     `https://adolepeter411.pythonanywhere.com/api/auth/microsoft/callback`
4. Click **Register** at the bottom.

### 3. Copy the two IDs

You are now on the app's **Overview** page. Under **Essentials**:

1. Next to **Application (client) ID**, click the copy icon and save the value. This is `MS_CLIENT_ID`.
2. Next to **Directory (tenant) ID**, click the copy icon and save the value. This is `MS_TENANT_ID`.

### 4. Add the local development address (optional)

Do this only if you also want Microsoft sign-in on your own computer.

1. In the app's left menu, click **Authentication**.
2. Under **Platform configurations** → **Web** → **Redirect URIs**, click **Add URI**.
3. Enter `http://localhost:5180/api/auth/microsoft/callback`
4. Leave **Access tokens** and **ID tokens** under "Implicit grant and hybrid flows" **unticked**. The portal doesn't need them.
5. Click **Save** at the bottom.

### 5. Create the client secret

1. In the left menu, click **Certificates & secrets**.
2. Open the **Client secrets** tab and click **+ New client secret**.
3. **Description:** `Access portal`.
4. **Expires:** choose **730 days (24 months)**, or whatever your IT policy allows.
5. Click **Add**.
6. **Copy the value in the "Value" column now.** It is shown only once; if you leave the page you must create a new secret. This is `MS_CLIENT_SECRET`.
   - Copy **Value**, not **Secret ID**.
7. Put a reminder in your calendar a few weeks before the expiry date. When it expires, Microsoft sign-in stops working until you create a new secret and update `.env`.

### 6. Check the permission and grant consent

1. In the left menu, click **API permissions**.
2. You should see **Microsoft Graph → User.Read (Delegated)**, which is added by default. If it is missing:
   - Click **+ Add a permission** → **Microsoft Graph** → **Delegated permissions**.
   - Search for and tick **User.Read**, then click **Add permissions**.
3. Click **Grant admin consent for Ladol**, then **Yes**. The status column turns into a green tick.
   This stops each member of staff being asked to approve the app on their first sign-in.

### 7. (Optional) Limit sign-in to certain staff

By default anyone in the organisation can sign in. To allow only selected people or groups:

1. Go to **Identity** → **Applications** → **Enterprise applications** and open **LADOL Access Portal**.
2. Click **Properties**, set **Assignment required?** to **Yes**, and click **Save**.
3. Click **Users and groups** → **+ Add user/group**, choose the people or groups, and click **Assign**.

Anyone not assigned sees a Microsoft error page when they try to sign in.

---

## Part 2: Add the values to the portal

### On PythonAnywhere

1. Open the **Files** tab and go to `/home/adolepeter411/ladolaccessrequestportal/`.
2. Click `.env` to open it in the editor and add:

   ```
   MS_TENANT_ID=<Directory (tenant) ID>
   MS_CLIENT_ID=<Application (client) ID>
   MS_CLIENT_SECRET=<client secret Value>
   MS_ALLOWED_DOMAINS=ladol.com
   ```

3. Check that these two lines are also there. The redirect address is built from `FRONTEND_URL`, so it must match the one you registered exactly:

   ```
   FRONTEND_URL=https://adolepeter411.pythonanywhere.com
   SESSION_COOKIE_SECURE=true
   ```

4. Click **Save**.
5. Open a **Bash console** and install the new library:

   ```bash
   cd ~/ladolaccessrequestportal && workon ladol && git pull && pip install -r requirements.txt && bash scripts/fetch_frontend.sh
   ```

6. On the **Web** tab, click **Reload**.

The free plan only allows connections to approved sites. `login.microsoftonline.com` and `graph.microsoft.com` are both on that list, so no change is needed.

### On your own computer

Add the same `MS_` lines to your local `.env`, keep `FRONTEND_URL=http://localhost:5180`, run `pip install -r requirements.txt`, and restart `python app.py`.

---

## Testing it

1. Open the sign-in page. You should see **Sign in with Microsoft** above the email and password form.
2. Click it, choose your `@ladol.com` account, and finish the Microsoft sign-in.
3. You land on the dashboard, or on **Profile & security** if your job title or phone is missing. That page now shows "Microsoft 365 account linked".

## Troubleshooting

| What you see | What to do |
|---|---|
| No Microsoft button | One of `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` is empty in `.env`, or the web app wasn't reloaded. |
| Microsoft error **AADSTS50011** (redirect URI mismatch) | The address in Step 2 or 4 doesn't exactly match `FRONTEND_URL` + `/api/auth/microsoft/callback`. Check http vs https and any trailing slash. |
| Microsoft error **AADSTS7000215** (invalid client secret) | You copied the **Secret ID** instead of the **Value**, or the secret expired. Create a new one (Step 5). |
| Microsoft error **AADSTS50105** (not assigned) | Assignment is required (Step 7) and that person isn't assigned. |
| "Need admin approval" from Microsoft | Admin consent wasn't granted (Step 6). |
| "Sign in with your @ladol.com Microsoft 365 account" on the portal | The person signed in with a non-`@ladol.com` account. |
| "This email is linked to a different Microsoft account" | The portal account is already linked to another Microsoft identity. Clear that user's `ms_oid` column in the database so the next Microsoft sign-in links it again. |
| "Your sign-in session expired" | The sign-in took too long or cookies are blocked. Try again. |
