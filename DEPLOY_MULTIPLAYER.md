# Orbital Kitchen — Online 4P WebSocket Multiplayer & Hosting Guide

## Why Vercel + External WebSocket Relay?
Vercel hosts static sites and short-lived serverless functions, so it **cannot** keep long-lived WebSocket connections open directly inside Vercel Functions.

To stay **100% zero-dependency** (no `npm`, `package.json`, or `node_modules`) while letting friends join from anywhere:
1. **Static Frontend (`index.html`, `src/`, `Assets/`, `styles.css`)** -> Deploy to **Vercel** (over `https://`).
2. **Pure Node.js WebSocket Relay (`server/ws-server.mjs`)** -> Run locally (`ws://localhost:8787`) or deploy to a persistent Node host such as **Render**, **Fly.io**, or **Railway** (over `wss://`).

---

## 1. Local Development & LAN Play
Start the built-in zero-dependency WebSocket + static file server:

```bash
node server/ws-server.mjs
```

- Open `http://localhost:8787` in up to 4 browser tabs or devices on your LAN.
- In Mission Setup, expand **4. Online 4P Co-Op (WebSocket)**:
  - The Relay URL automatically defaults to `ws://localhost:8787` (or `ws://<your-host>:8787`).
  - Enter a callsign and click **Host Room** to get a 4-character room code (e.g. `K7M4`) + shareable invite link (`?room=K7M4&ws=...`).
  - Friends paste the invite link or enter the room code and click **Join**.
  - Empty crew slots (`P1 Launch`, `P2 Space`, `P3 Science`, `P4 Ground`) automatically run as AI squadmates.

Environment variables (optional):
- `PORT` (default `8787`)
- `HOST` (default `0.0.0.0`)
- `SERVE_STATIC` (default `true`; set `SERVE_STATIC=false` in production relay deployments if Vercel serves the frontend)

Health check endpoint:
- `GET /health` -> `200 OK` JSON `{ "ok": true, "rooms": ..., "clients": ... }`

---

## 2. Hosting Frontend on Vercel
1. Push your branch (`dev/multiplayer` or merged `main`) to GitHub/GitLab/Bitbucket.
2. Import the repository in Vercel as a **Static / Other** project:
   - Framework Preset: `Other`
   - Build Command: *(empty)*
   - Output Directory: `.`
3. Deploy. Your game loads at `https://<your-project>.vercel.app`.

---

## 3. Deploying `server/ws-server.mjs` (Render / Fly.io / Railway)
Because your Vercel site runs on `https://`, browsers require a secure `wss://` WebSocket endpoint (all three hosts provide TLS termination automatically).

### Option A: Render (Web Service)
- Runtime: **Node** (Node 20+)
- Build Command: *(leave blank — zero dependencies)*
- Start Command: `SERVE_STATIC=false node server/ws-server.mjs`
- Health Check Path: `/health`
- Resulting relay URL: `wss://<your-service>.onrender.com`

### Option B: Railway
- Start Command: `SERVE_STATIC=false node server/ws-server.mjs`
- Healthcheck Path: `/health`
- Resulting relay URL: `wss://<your-service>.up.railway.app`

### Option C: Fly.io
- Run a minimal Node container (no `npm install` needed) executing `SERVE_STATIC=false node server/ws-server.mjs` exposing internal port `8787`.
- Resulting relay URL: `wss://<your-app>.fly.dev`

---

## 4. Wiring Your Default Relay URL
Once your `wss://` relay is live, either:
- Set `MULTIPLAYER_CONFIG.defaultWsUrl` in `src/config.js`:
  ```js
  export const MULTIPLAYER_CONFIG = {
    defaultWsUrl: 'wss://your-relay.onrender.com',
    defaultLocalPort: 8787,
    snapshotHz: 18,
    inputHz: 25
  };
  ```
- **Or** paste the `wss://...` URL once into the **Relay URL** field inside the in-game lobby (saved in `localStorage` and embedded automatically in **Copy Invite** links via `?room=XXXX&ws=wss://...`).
