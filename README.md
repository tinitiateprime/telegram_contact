# Telegram Workflow Dashboard

This project is a local Node.js/TypeScript application for connecting one or more Telegram user accounts, sending messages from the selected account, saving workflow data in the browser workspace, and storing Telegram sessions/messages securely in PostgreSQL.

The important idea:

```text
Browser dashboard -> local backend API -> encrypted per-account Telegram session -> Telegram
```

The Telegram API ID and API Hash belong to the server application. They stay in `.env`. Each connected phone number creates its own encrypted Telegram session in PostgreSQL, so one phone number is never reused as another sender.

## What You Can Do

- Sign in to the browser dashboard with a configured JSON user.
- Connect Telegram phone numbers with verification code and optional Telegram 2FA password.
- Select which connected profile/number should send messages.
- Send quick messages to `@username` or `+countrycode` phone numbers.
- Manage local profiles, contacts, inbox threads, groups, channels, posts, search, settings, and backup JSON.
- Create, preview, save, send, and schedule posts from the browser workspace.
- Record sent-post history in browser JSON and backend message history in PostgreSQL.
- Run a separate listener worker to save incoming Telegram replies.
- Run an optional Telegram Bot API auto-reply worker.

## Project Structure

```text
contact-telegram/
  README.md                         Project guide
  package.json                      npm scripts and dependencies
  tsconfig.json                     TypeScript build config
  .env.example                      Secret-free local env template
  src/
    server.ts                       HTTP API and browser UI server
    account-client.ts               Telegram user-account login, send, media, listen helpers
    store.ts                        PostgreSQL tables, encryption, users, sessions, messages
    config.ts                       .env loading and runtime config
    login-config.ts                 JSON username/password login config
    listen.ts                       Incoming-message listener worker
    login.ts                        CLI Telegram account connection helper
    send-direct.ts                  CLI send helper
    issue-token.ts                  CLI app access-token reset helper
    bot.ts                          Optional Telegram Bot API auto-reply worker
  public/
    index.html                      Browser dashboard shell
    app.js                          Browser workflow logic
    styles.css                      Dashboard styles
  config/
    users.json                      Local username/password login users
    bot-answers.json                Saved bot answer rules
  docs/
    telegram-workflow-requirements.md
    screenshots/                    Setup and workflow screenshots
  dist/                             Compiled JavaScript after npm run build
  logs/                             Local log/output files
```

## Prerequisites

- Node.js 20 or newer.
- npm.
- PostgreSQL 14 or newer.
- A Telegram API ID and API Hash from `https://my.telegram.org`.
- A real Telegram phone number for each account you want to connect.
- For production use: HTTPS, a real auth system, secret manager, backups, monitoring, and network restrictions.

## First-Time Local Setup

### 1. Install Packages

```bash
npm install
npm run build
```

### 2. Create a PostgreSQL Database

In pgAdmin or `psql`, create a dedicated database and user:

```sql
CREATE ROLE telegram_app WITH LOGIN PASSWORD 'Choose_A_Private_Db_Password';
CREATE DATABASE telegram_multiuser OWNER telegram_app;
```

Do not use a shared or unrelated database. The app creates its own tables on first server startup.

### 3. Create `.env`.

Copy the example file:

```powershell
Copy-Item .env.example .env
```

On macOS/Linux:

```bash
cp .env.example .env
```

Generate two different private keys:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Run the command twice. Put the first value in `SESSION_ENCRYPTION_KEY` and the second value in `USER_PROVISIONING_KEY`.

Fill `.env` like this:

```env
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=your_telegram_api_hash
DATABASE_URL=postgresql://telegram_app:Choose_A_Private_Db_Password@127.0.0.1:5432/telegram_multiuser
SESSION_ENCRYPTION_KEY=generated_key_1
USER_PROVISIONING_KEY=generated_key_2
SERVICE_HOST=127.0.0.1
SERVICE_PORT=8787
```

Never commit or share `.env`, Telegram API Hashes, access tokens, Telegram login codes, 2FA passwords, bot tokens, session strings, or generated keys.

### 4. Start the API and Browser UI

```bash
npm run server
```

Expected output:

```text
Telegram multi-users API listening on http://127.0.0.1:8787
```

Open:

```text
http://127.0.0.1:8787
```

### 5. Sign In

The local default username/password is read from [config/users.json](config/users.json):

```text
username: admin
password: admin123
```

Change these credentials before sharing the app with anyone. You can also set `AUTH_CONFIG_PATH` to point at another JSON login file.

### 6. Connect a Telegram Number

In the dashboard:

1. Open `Add Number`.
2. Enter the Telegram phone number with country code, for example `+91XXXXXXXXXX`.
3. Submit the Telegram verification code sent by Telegram.
4. If prompted, enter that Telegram account's 2FA password.
5. Select the connected profile from the top `Profile` selector.

The selected profile controls the sender for quick messages, inbox replies, and post sending.

### 7. Optional: Start Incoming Message Listening

Open a second terminal:

```bash
npm run listen
```

This starts one Telegram listener for each account already connected when the worker starts. Restart it after adding a new Telegram number.

## Daily Local Workflow

Use two terminals:

```bash
# Terminal 1
npm run server
```

```bash
# Terminal 2, optional but needed for incoming replies
npm run listen
```

Then use the browser at `http://127.0.0.1:8787`.

If frontend files changed, restart `npm run server` and hard refresh the browser with `Ctrl + F5`.

## Docker Compose Workflow

Use Docker when you want the app and PostgreSQL to run together without installing PostgreSQL locally.

1. Copy the Docker env template:

```bash
cp .env.docker.example .env.docker
```

On Windows PowerShell:

```powershell
Copy-Item .env.docker.example .env.docker
```

2. Fill `.env.docker` with `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `SESSION_ENCRYPTION_KEY`, and `USER_PROVISIONING_KEY`.

Generate the two private keys with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

3. Start the app and database:

```bash
docker compose up --build
```

Open:

```text
http://127.0.0.1:8787
```

Useful Docker commands:

```bash
docker compose up -d --build
docker compose logs -f app
docker compose down
docker compose down -v
```

`docker compose down -v` deletes the PostgreSQL volume and all connected Telegram sessions/messages. Use it only when you want a fresh database.

If port `8787` is already in use, stop your local `npm run server` process first or change the host port in `docker-compose.yml` from `8787:8787` to another host port, for example `8788:8787`.

## Browser Dashboard Guide

### Dashboard

Shows a summary of connected numbers, contacts, groups, channels, posts, and the currently selected profile.

### Add Number

Connects a Telegram phone number. The backend sends the Telegram code request, stores the temporary login challenge encrypted, and saves the final session encrypted in PostgreSQL.

### Manage Numbers

Lists connected Telegram accounts. You can search, filter, refresh, or delete a connected account. Deleting removes the local account record and attempts to revoke the Telegram session.

### Profiles

Stores local profile metadata such as profile name, display name, username, phone, avatar/image URL, status, description, and config numbers.

Profile metadata is browser localStorage JSON. Telegram sessions are not stored in the browser.

### Applications

Shows the current Telegram workflow and placeholder slots for later workflow modules.

### Contacts

Stores local contact records with name, Telegram username, phone number, group label, and notes.

Supported recipient formats:

```text
@telegram_username
+91XXXXXXXXXX
```

Contacts can be added, edited, deleted, searched, exported as JSON, and imported from JSON.

### Inbox

Shows saved contacts and backend message history for the selected Telegram account. Use `npm run listen` to save incoming Telegram replies. The inbox can send replies to a selected contact when that contact has a username or phone number.

### Groups

Stores local broadcast-list style groups. Each group can have one recipient per line:

```text
@member_username
+91XXXXXXXXXX
```

When selected in Post Manager, the app sends to each saved group member one by one. This is not yet private Telegram group sync by `chatId` or `accessHash`.

### Channels

Stores local channel/invite notes for workflow planning. Channel records are local browser JSON and do not currently sync Telegram channel membership.

### Post Manager

Create and manage posts with title, type, category, tags, status, schedule date/time, media URL, body/caption, manual target, saved contacts, and saved groups.

Post types include text, image, video, document, audio, voice, link preview, poll text, forwarded style, announcement, campaign, and template style records. Actual Telegram sending supports text plus optional media URL/data URL.

To send:

1. Select the sender profile at the top of the app.
2. Open `Post Manager`.
3. Fill title and body/caption.
4. Optionally add a direct public media URL or supported base64 data URL.
5. Add a manual target, select contacts, select groups, or combine them.
6. Click `Save post`.
7. Check the preview.
8. Click `Post now` or schedule a date/time.

The app combines all targets, removes duplicates, and sends from the currently selected profile.

### Post History

Shows sent, failed, pending, ready, draft, and scheduled post records from browser localStorage. Each send attempt records recipient, contact/group source, delivery status, sent date/time, Telegram message ID when available, and error text when failed.

Backend message history is also stored encrypted in PostgreSQL and exposed through `GET /v1/messages`.

### Search

Searches local profiles, contacts, groups, channels, and posts in the browser workspace.

### Configuration

Stores browser-side workflow settings such as API label, Telegram workflow label, session label, proxy notes, storage label, and theme.

### Backup

Exports/imports browser workspace JSON:

- profiles
- contacts
- groups
- channels
- posts
- post history
- settings

Backups do not include `.env`, PostgreSQL data, Telegram session strings, access tokens, or Telegram API credentials.

## Server-Side Data

The backend creates these PostgreSQL tables automatically:

- `app_users`: application users and hashed access tokens.
- `app_sessions`: hashed browser session cookies.
- `telegram_accounts`: connected Telegram account metadata and encrypted session strings.
- `telegram_login_challenges`: encrypted temporary login state.
- `telegram_messages`: encrypted inbound/outbound message records.

Encrypted fields use `SESSION_ENCRYPTION_KEY`. Keep this key stable. If it changes, existing encrypted Telegram sessions and messages cannot be decrypted.

## Browser Local Data

The workflow dashboard stores these localStorage keys:

```text
telegramWorkflow:selectedAccount
telegramWorkflow:profiles
telegramWorkflow:contacts
telegramWorkflow:groups
telegramWorkflow:channels
telegramWorkflow:posts
telegramWorkflow:postHistory
telegramWorkflow:settings
```

Use `Backup -> Export backup` before clearing browser data or moving browsers.

## Environment Variables

Main app variables:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `TELEGRAM_API_ID` | Yes | None | Server app API ID from `my.telegram.org`. |
| `TELEGRAM_API_HASH` | Yes | None | Server app API Hash from `my.telegram.org`. |
| `DATABASE_URL` | Yes | None | PostgreSQL connection string. |
| `SESSION_ENCRYPTION_KEY` | Yes | None | Base64url 32-byte key for encrypted sessions/messages. |
| `USER_PROVISIONING_KEY` | Yes | None | Admin secret for `POST /v1/users`. |
| `SERVICE_HOST` | No | `127.0.0.1` | HTTP bind host. |
| `SERVICE_PORT` | No | `8787` | HTTP bind port. |
| `CORS_ORIGIN` | No | blank | Exact allowed external frontend origin. Keep blank for same-origin UI. |
| `LOGIN_CHALLENGE_TTL_MINUTES` | No | `10` | Telegram code challenge lifetime. |
| `APP_SESSION_TTL_HOURS` | No | `24` | Browser cookie session lifetime. |
| `SESSION_COOKIE_SECURE` | No | `false` | Set `true` behind HTTPS. |
| `RATE_LIMIT_WINDOW_SECONDS` | No | `60` | Rate-limit window. |
| `RATE_LIMIT_MAX_REQUESTS` | No | `120` | General API requests per window. |
| `LOGIN_START_RATE_LIMIT_MAX` | No | `5` | Telegram login starts per user/window. |
| `MESSAGE_RATE_LIMIT_MAX` | No | `20` | Sends per account/window. |
| `AUTH_CONFIG_PATH` | No | None | Optional path to username/password JSON file. |

Bot variables, only needed for `npm run bot`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot only | None | BotFather token. |
| `BOT_ANSWERS_PATH` | No | `config/bot-answers.json` | Saved keyword answer rules. |
| `BOT_POLL_TIMEOUT_SECONDS` | No | `25` | Long-poll timeout. |
| `BOT_FALLBACK_REPLY` | No | Built in | Reply when no rule/responder matches. |
| `BOT_RESPONDER_URL` | No | blank | Optional external responder endpoint. |
| `BOT_RESPONDER_TIMEOUT_SECONDS` | No | `15` | External responder timeout. |
| `BOT_CLEAR_WEBHOOK_ON_START` | No | `true` | Deletes webhook before polling. |

## Login User Configuration

The browser password login reads users from the first available source:

1. `AUTH_CONFIG_PATH`
2. `config/users.json`
3. `auth.json`
4. Built-in fallback `admin` / `admin123`

Supported JSON shape:

```json
{
  "users": [
    {
      "username": "admin",
      "password": "admin123",
      "displayName": "Administrator"
    }
  ]
}
```

For production, replace this with your real authentication layer. Do not expose the provisioning key or raw access tokens to normal users.

## API Reference

All API responses are JSON. Browser endpoints also accept the HTTP-only `app_session` cookie after sign-in. CLI/API callers can use:

```text
Authorization: Bearer <accessToken>
```

### Health

```text
GET /health
```

### Create an App User

Trusted/admin flow only:

```text
POST /v1/users
x-provisioning-key: <USER_PROVISIONING_KEY>
Content-Type: application/json

{ "displayName": "New User" }
```

The response returns an `accessToken` once. Store it privately.

### Browser Sign-In

Username/password:

```text
POST /v1/auth/password
Content-Type: application/json

{ "username": "admin", "password": "admin123" }
```

Access-token bootstrap:

```text
POST /v1/auth/session
Content-Type: application/json

{ "accessToken": "tgr_..." }
```

Sign out:

```text
DELETE /v1/auth/session
```

Current user:

```text
GET /v1/me
```

### Telegram Login

Start login:

```text
POST /v1/telegram/login/start

{ "phone": "+919876543210" }
```

Submit Telegram code:

```text
POST /v1/telegram/login/<challengeId>/code

{ "code": "12345" }
```

If `password_required`, submit Telegram 2FA password:

```text
POST /v1/telegram/login/<challengeId>/password

{ "password": "telegram_2fa_password" }
```

### Accounts

```text
GET    /v1/telegram/accounts
DELETE /v1/telegram/accounts/<accountId>
```

### Messages

Send from an account owned by the signed-in user:

```text
POST /v1/messages
Content-Type: application/json

{
  "accountId": "connected-account-id",
  "recipient": "@telegram_username",
  "message": "Hello",
  "mediaUrl": "https://example.com/image.jpg",
  "mediaType": "image",
  "firstName": "Optional",
  "lastName": "Contact"
}
```

`recipient` can be:

```text
@telegram_username
+91XXXXXXXXXX
public_group_or_channel_username
```

Phone-number delivery imports the number as a Telegram contact. It can fail if the number is wrong, the person is not on Telegram, or privacy settings block discovery. Prefer usernames when possible.

List message history:

```text
GET /v1/messages?accountId=<accountId>&limit=50
```

The maximum returned limit is capped at 100.

## CLI Helpers

Create/connect a Telegram account from the terminal:

```bash
npm run login -- --token YOUR_ACCESS_TOKEN
```

Send from a connected account:

```bash
npm run send -- --token YOUR_ACCESS_TOKEN --account-id ACCOUNT_ID --recipient @username --message "Hello"
```

Issue a fresh app access token for the user who owns a connected account:

```bash
npm run issue-token -- ACCOUNT_ID
```

Run incoming-message listener:

```bash
npm run listen
```

Compile TypeScript:

```bash
npm run build
```

Run compiled server after build:

```bash
npm start
```

## Optional Telegram Bot Auto-Reply Worker

This is separate from the connected-phone sender flow.

Connected-phone flow:

```text
Dashboard/API -> user's encrypted Telegram session -> sends as that phone number
```

Bot flow:

```text
Telegram user opens your bot -> bot receives text -> npm run bot replies
```

Create a bot with `@BotFather`, add the token to `.env`, then run:

```bash
npm run bot
```

Saved answers live in [config/bot-answers.json](config/bot-answers.json):

```json
{
  "answers": [
    {
      "keywords": ["price", "pricing", "cost"],
      "answer": "Please share the service or product name so our team can send the correct price."
    }
  ]
}
```

Bot commands:

- `/start`: welcome message.
- `/help`: usage help.
- `/ping`: health check reply.
- `/reload`: reload saved answers from JSON.

If `BOT_RESPONDER_URL` is set, the bot sends each question to that HTTP endpoint and falls back to saved answers if the responder fails or returns no reply.

Responder request shape:

```json
{
  "chatId": 123456,
  "messageId": 10,
  "userId": 999,
  "username": "telegram_user",
  "displayName": "Telegram User",
  "text": "What are your prices?"
}
```

Responder response shape:

```json
{ "reply": "Your answer text" }
```

or:

```json
{ "answer": "Your answer text" }
```

Telegram bots can reply only to users who started the bot or to groups where the bot is added and allowed to read messages.

## Screenshots and Requirements

Screenshots are in [docs/screenshots](docs/screenshots). Requirement coverage and known workflow gaps are tracked in [docs/telegram-workflow-requirements.md](docs/telegram-workflow-requirements.md).

## Current Limitations

- Contacts, groups, channels, posts, settings, and post history are browser-local workspace JSON, not shared server records.
- Contacts and groups are not strictly scoped per selected profile yet.
- Saved groups are local broadcast lists, not private Telegram group sync by `chatId`/`accessHash`.
- Scheduled posts send only while the browser workspace is open and signed in. There is no server-side scheduler worker yet.
- Channel records are local planning records and do not manage Telegram channel membership.
- A dedicated QR Code tab is listed in requirements but is not implemented in the UI yet.
- `npm run listen` loads accounts only at startup. Restart it after adding or deleting numbers.

## Troubleshooting

### Server says an env variable is required

Check `.env` exists in the project root and has every required value. The app loads `.env` automatically from the current working directory.

### `SESSION_ENCRYPTION_KEY must be a base64url-encoded 32-byte key`

Generate a new key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Only change this on a fresh database. Changing it on existing data makes encrypted sessions/messages unreadable.

### Browser sign-in fails

Check `config/users.json` or the file pointed to by `AUTH_CONFIG_PATH`. The username comparison is case-insensitive. Password comparison is exact.

### Telegram code is invalid or expired

Use the latest code sent by Telegram. If it expired, start the Add Number flow again.

### Message send says recipient cannot be resolved

Use a public `@username` if possible. Phone numbers must include `+countrycode`, and Telegram privacy settings may block phone lookup.

### Media send fails

Use a direct public `http(s)` media URL or a valid base64 data URL. Some hosts block Telegram from downloading files.

### Inbox does not show incoming replies

Run `npm run listen` in a second terminal and restart it after connecting new numbers.

### Port already in use

Change `SERVICE_PORT` in `.env`, then restart `npm run server`.

## Production Checklist

- Replace local JSON login with your real auth/session system.
- Change the default `admin` / `admin123` credentials.
- Use HTTPS and set `SESSION_COOKIE_SECURE=true`.
- Keep `.env` and all secrets in a secret manager.
- Restrict network access to PostgreSQL and the API.
- Set exact `CORS_ORIGIN` only if the frontend is hosted separately.
- Add backups for PostgreSQL and exported workspace JSON where needed.
- Add monitoring, structured logs, retries, abuse controls, and alerting.
- Respect Telegram rate limits, user consent, privacy rules, and data-retention obligations.
