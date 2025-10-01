# Metadata Editor

A web-based image metadata editor that allows you to view and modify EXIF data, GPS coordinates, and other metadata in image files.

## 🚀 Quick Start

### Development Mode (Node.js only)
```bash
node server.js
```
The server will run at `http://localhost:3000`
If port 3000 is in use, set a different port via `.env`: `PORT=3001`.

### Reverse Proxy (Synology) Notes
When exposing this app via Synology Reverse Proxy over HTTPS:
- Set a strong `SESSION_SECRET`.
- Set `TRUST_PROXY=1` so Express trusts proxy headers.
- Set `COOKIE_SECURE=1` to send session cookies only over HTTPS.

## 📁 Project Structure
```
metadata-editor/
├─ public/                # Client UI (index.html, login.html)
├─ scripts/               # Utility scripts (init-db)
├─ db/                    # SQLite databases (auth.db, sessions.db)
├─ temp/                  # Temp files (uploads preview, etc.)
├─ server.js              # Node.js backend
├─ package.json
└─ web.config             # Ignore for local/Synology (legacy)
```

## 🔄 Development Workflow

1) Start locally
```powershell
# Option A: .env file
# 1) Copy .env.example to .env and set SESSION_SECRET (and others if needed)
# 2) Start normally
npm start

# Option B: set environment vars in the shell
$env:SESSION_SECRET = "your-long-random-secret"; npm start
```
Open http://localhost:3000/login.html and sign in.

2) Expose via Synology Reverse Proxy (HTTPS)
```powershell
# Using .env (recommended)
# In .env set:
# SESSION_SECRET=your-long-random-secret
# TRUST_PROXY=1
# COOKIE_SECURE=1
npm start
```

## 🌐 Access URLs
- **Development**: `http://localhost:3000`
- **GitHub Repository**: https://github.com/rglek0/Metadata-Editor

## ⚙️ Notes
- Upload directory path is configured in `server.js` (currently points to a network share). Ensure the Node process has write permissions.
- SQLite files are stored in `./db/` (auto-created). Old DBs in `./temp/` are migrated automatically on first run.

## 🛠️ Troubleshooting
- **403/404 Errors**: Check file permissions and ensure Node.js server is running
- **Upload Issues**: Verify `uploads/` directory permissions
- **Metadata Processing**: Ensure ExifTool is available in the system PATH
 - **Too many login attempts (429)**: The app rate-limits login attempts by default (10 attempts per 15 minutes). Adjust via `.env`:
	 - `LOGIN_WINDOW_MS` (default 900000)
	 - `LOGIN_MAX_ATTEMPTS` (default 10)

## 🔐 Authentication

Authentication is enabled using SQLite and server-side sessions.

- Login page: `/login.html`
- Protected routes: `/` (app UI), `/upload`, `/metadata`

Create an initial admin user:

```powershell
npm run seed:user -- <username> <password> [role]
```

Change a user's password:

```powershell
npm run user:password -- <username> "<newPassword>"
```

If you omit arguments, you'll be prompted interactively.

When running behind Synology RP, prefer using a .env file:

1. Copy `.env.example` to `.env`
2. Set:
	- `SESSION_SECRET=your-long-random-secret`
	- `TRUST_PROXY=1`
	- `COOKIE_SECURE=1`
3. Start the server with `npm start`

Quick test steps:
1. Seed a user: `npm run seed:user -- admin "yourPassword"`
2. Start server: `npm start`
3. Open: `http://localhost:3000/login.html`
4. After login you’ll be redirected to `/` and can use the app; uploads and metadata preview are protected.