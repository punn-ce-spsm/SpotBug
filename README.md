# SpotBug

A mobile-first, Kahoot-style quiz game where teachers upload screenshots of buggy code and students race to tap the bug on their own phones.

Live demo (client only — see [Deployment](#deployment)): https://punn-ce-spsm.github.io/SpotBug/

## How it works

- **Teacher**: upload a code screenshot, click to mark each bug and drag to set its tolerance radius, set a time limit, then host the quiz to get a 6-digit PIN.
- **Students**: join with the PIN and a nickname on their phone, then tap the bug(s) before time runs out.
- Scoring follows Kahoot's formula (faster = more points, up to 1000, decaying to 500) plus a +100 streak bonus at 2+ correct answers in a row.
- A leaderboard is shown after every question, then a final podium.

## Project layout

```
/client   React + Vite app (teacher dashboard and student play screen)
/server   Node + Socket.io relay server (in-memory session state only)
```

There is no database and no accounts. Quizzes are saved in the teacher's browser (`localStorage`), with JSON export/import for backup or moving between devices. The server only holds live session state (PIN, connected players, current question, scores) in memory — it resets on restart.

## Running locally

**Server:**
```
cd server
npm install
npm start          # listens on :3001
```

**Client:**
```
cd client
npm install
npm run dev         # http://localhost:5173
```

By default the client connects to `http://localhost:3001`. To point it at a different relay server, set `VITE_SERVER_URL` (e.g. in `client/.env`).

## Deployment

The client is a static site and can be deployed anywhere (GitHub Pages, Netlify, Vercel, etc.). It's currently deployed to GitHub Pages via `.github/workflows/deploy-pages.yml`, which builds `client/` and publishes `client/dist` on every push to `main`.

**Important**: GitHub Pages only serves the static client — it cannot host the Socket.io relay server. For hosting/joining a live game to actually work from the deployed site, the `/server` needs to run somewhere reachable (Render, Railway, Fly.io, a VPS, etc.), and the client needs to be built with `VITE_SERVER_URL` pointing at that server's URL. Without a running server, the deployed site will load but PIN join/host actions will fail to connect.

The client uses a hash router (`/#/route`) rather than path-based routing, since GitHub Pages (and most static hosts) have no server-side rewrite rules to support direct links to client-side routes.
