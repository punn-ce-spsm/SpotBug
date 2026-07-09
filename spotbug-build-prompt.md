# SpotBug — Build Prompt

Build a mobile-first web game called **SpotBug**. Teachers upload images of code containing one or more bugs; students race to tap the bug(s) on their own phones. Live, real-time, Kahoot-style session with speed-based scoring and a leaderboard shown after every question.

## Roles & Flows

### Teacher / Admin — Create Quiz
- Upload a code image (screenshot or image file) per question.
- Click on the image to mark each bug's location, then set a tolerance radius (draggable circle) around it. Support **multiple bugs per image**.
- Set a time limit per question (default 30s, editable).
- Add/reorder/delete multiple questions to build a quiz.
- Quizzes autosave to the browser's localStorage (no server DB — see architecture below). Include **Export/Import as JSON** so a teacher can reuse or move a quiz across devices.

### Teacher / Admin — Host a Live Session
- Pick a saved quiz → "Host" → server generates a 6-digit PIN.
- Lobby screen: shows the PIN and a live list of joined student nicknames.
- "Start" begins question 1.
- After every question, automatically show a **leaderboard** (top ranks + movement), exactly like Kahoot.
- "Next" (or auto-advance) continues to the next question.
- Final screen: podium (top 3) + full ranked list.

### Student — Join & Play
- Join screen: enter PIN + nickname. Big touch-friendly inputs, phone-first layout.
- Waiting lobby until the teacher starts.
- Question screen: the code image renders directly on **the student's own phone**; countdown timer running; student taps on the image where they think the bug(s) are.
- Multi-bug handling: student can tap multiple spots. Each tap landing inside a bug's tolerance circle marks that bug "found" (visual confirmation, e.g. checkmark). **The question only counts as correct if the student finds all marked bugs** before time runs out. They can submit early once all are found, otherwise it auto-submits at time-up.
- Immediate feedback: correct/incorrect + points earned.
- Leaderboard shown after every question, student's own rank highlighted.

## Scoring — exact Kahoot formula
For a fully-correct answer (all bugs found, before time runs out):

```
points = floor( (1 - (responseTimeMs / questionTimeLimitMs) / 2) * 1000 )
```

- Max 1000 pts (near-instant answer), decaying toward 500 pts as time runs out.
- 0 pts if wrong, incomplete (not all bugs found), or time expires.
- **Streak bonus**: +100 flat once a player's consecutive-correct streak reaches 2+ in a row; streak resets to 0 on any wrong/incomplete/timed-out answer. This matches Kahoot's real behavior.

## Real-time architecture (no database, no accounts)
Live sync across teacher + student devices needs *some* server — but keep it minimal:
- A lightweight **in-memory relay server** (Node.js + Socket.io, or plain `ws`) that only holds active session state (PIN, connected players, current question, scores) in memory. Nothing is persisted server-side — state resets on restart. No auth, no accounts.
- The teacher's browser holds the quiz (from localStorage) and sends it to the relay server when a session starts; the server broadcasts each question to connected students in real time and relays taps/scores back to the host.
- **Critical detail**: store and transmit bug coordinates and tolerance radius as **fractions (0–1) of image width/height**, not raw pixels, since phone screens vary. Convert each student's tap (x, y) into the same fractional space before checking it against a bug's tolerance circle.

## Suggested stack
- Frontend: React + Vite, mobile-first responsive CSS. One app, two views (teacher dashboard / student play screen).
- Real-time: Socket.io (or `ws`) server, in-memory session state only.
- No database, no auth — quizzes live in the teacher's browser (localStorage) with JSON export/import as the only persistence.
- Repo layout: `/client` (React app — both teacher & student views) + `/server` (relay server).

## Explicit MVP constraints — please don't add unless asked
- No user accounts, no persistent database, no payments, no analytics.
- No AI bug-detection — bug locations are always manually marked by the teacher.
- Keep the UI bright and playful (Kahoot-like colors/energy), but simple, clean components are fine for v1 — polish later.
