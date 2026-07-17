# Backend Data Model

Stack: **Node.js + TypeScript + Prisma + PostgreSQL + Socket.IO**. See `schema.prisma`
for the full schema. Built multi-tenant (`Clan → Board → Team`) from the start since
this is headed to the Plugin Hub — other clans will eventually run against the same
service, or fork it and run their own.

## Entities

- **Clan** — one row per clan using the tool.
- **Board** — a bingo board, owned by a clan. Grid dimensions + line-bonus point
  values live here, matching what we saw on the real board (horizontal/vertical/
  diagonal/blackout).
- **Tile** — one cell. `metric`/`mode`/`target`/`sources` map directly onto the
  criteria schema from `tile-criteria-schema.md` — the `misclickers-fall-bingo.json`
  file can be loaded almost verbatim into this table via a seed script.
- **Team** — belongs to a board, has a unique `joinCode`. This is an invite code,
  not a personal password, so it's stored and looked up directly (no hashing) —
  hashing would make it impossible to find *which* team a code belongs to without
  brute-force comparing against every team.
- **TeamMember** — RSNs on the team. Open-join: correct password + an RSN not yet
  seen on that team just upserts a new member row. No pre-registration step.
- **TileProgress** — materialized current state per (team, tile): what the plugin
  actually reads to draw the board. One row per team per tile, created lazily on
  first progress toward it.
- **CompletionEvent** — append-only log of every reported completion, including the
  raw chat line that triggered it. Not required by the current trust model
  (auto-accept, self-reported), but cheap to keep now and means a future
  spot-check/audit view doesn't need a schema change later.

## Auth flow

1. Plugin sends `POST /teams/join { joinCode, rsn }`.
2. Server looks the team up directly by `joinCode`, upserts the `TeamMember` row.
3. Server returns a **JWT** encoding `{ teamId, boardId, rsn }`, short expiry with
   silent refresh. No sessions table — the token itself is the credential for both
   REST calls and the WebSocket handshake.
4. Plugin opens a Socket.IO connection with the token; server verifies it and joins
   the socket to room `team:<teamId>`.

## Completion flow

`POST /completions { tileId, metric, source, amount }` (authenticated):

1. Look up the tile, confirm `source` matches (case-insensitive) something in
   `tile.sources` and `metric` matches `tile.metric`. Reject otherwise.
2. Load or create the `TileProgress` row for `(team, tile)`.
3. **mode = SUM**: `sumProgress += amount`. If `sumProgress >= target` and
   `completedAt` is null, set `completedAt = now()` — tile just completed.
   If it was *already* completed and `tile.repeatable` is true, instead increment
   `repeatCount` (this is exactly the pet tile: first pet completes it,
   every pet after adds to `repeatCount`, each worth `bonusPerRepeat` points).
4. **mode = EACH**: increment `eachProgress[source]`. If every source in
   `tile.sources` now has a count `>= target`, set `completedAt = now()`.
5. Append a `CompletionEvent` row with the raw match for the audit trail.
6. Recompute the team's score (see below) and broadcast `{ tileId, progress, score }`
   to room `team:<teamId>` over the socket. Every teammate's panel updates live.

No caching layer needed here — boards are ~25 tiles, so recomputing progress and
score on every write is trivially cheap.

## Score calculation

Computed on read / on every broadcast, not stored, to avoid drift:

```
score = Σ tile.points, for tiles where completedAt != null
      + Σ tile.bonusPerRepeat × repeatCount, for repeatable tiles
      + line bonuses (row/col/diagonal of all-completed tiles → board.bonusHorizontal
        / bonusVertical / bonusDiagonal)
      + board.bonusBlackout, if every tile on the board is completed
```

Line bonuses are derived directly from `Tile.row`/`Tile.col` plus which
`TileProgress` rows have `completedAt` set — no separate "lines completed" table.

## API surface (MVP)

- `POST /admin/boards` — create a board + its tiles, body shaped like
  `misclickers-fall-bingo.json`.
- `POST /admin/boards/:id/teams` — create a team, returns the generated password.
- `POST /teams/join` — player auth, described above.
- `GET /boards/:id/state` — board + this team's tile progress + current score.
- `POST /completions` — report a detected event, described above.
- `WS /ws?token=...` — live updates for the authenticated team.

The admin endpoints are unauthenticated-by-clan-secret for now (single admin: you).
If this becomes genuinely multi-clan on the Hub later, that's where real clan-owner
accounts would need to slot in — worth knowing about now, not solving yet.
