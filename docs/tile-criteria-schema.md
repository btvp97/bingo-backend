# Tile Criteria Schema

Every tile reduces to one of two detection mechanisms:

1. **Chat message regex** — kill counts ("Your X kill count is: N"), collection log
   ("New item added to your collection log: X"), and activity completions (LMS wins,
   Fight Caves, raids, clue caskets, pet received). Covers ~90% of real bingo tiles.
2. **Inventory diff** (`ItemContainerChanged`) — fallback for items/currencies that
   don't hit the collection log or a chat line (e.g. stackable minigame currencies).

## Shape

```json
{
  "id": "tile-uuid",
  "title": "human-readable title shown on the board",
  "points": 5,
  "repeatable": false,
  "criteria": {
    "metric": "kill_count | item_obtained | activity_completion",
    "mode": "sum | each",
    "target": 200,
    "sources": ["The Nightmare"]
  }
}
```

- **metric** — what kind of event satisfies this tile.
- **mode: sum** — every matching event across all listed `sources` adds toward one
  shared `target`. Used for simple thresholds ("kill 200 times") and "any N of these
  count" tiles (target=1 with a list = "obtain any one of these items").
- **mode: each** — every source in the list needs its own count to hit `target`
  (usually 1). Used for "full set" / "one of each" tiles — a Zealot's robes set, DK
  rings, Moons armor pieces.
- **repeatable** — if true, the tile can be credited more than once per team (only
  "Get a Pet" on this board). Pairs with **bonusPerRepeat**: once the tile first
  completes (target reached), each additional matching event afterward adds
  `bonusPerRepeat` points directly to the team's score, uncapped — no further tile
  state to track beyond a repeat counter.
- Progress is tracked per **team**, reset at board start (not lifetime stats).

## Worked mapping: Misclickers Fall Bingo (board 5828)

See `misclickers-fall-bingo.json` for the full machine-readable version. Summary:

| Tile | Metric | Mode | Target | Sources |
|---|---|---|---|---|
| Soulreaper Axe (4 pieces) | item_obtained | each | 1 | 4 axe piece drops |
| Dragon Chainbody | item_obtained | sum | 1 | Dragon chainbody |
| 5000 Pieces of Eight | item_obtained | sum | 5000 | Pieces of Eight |
| 10 LMS wins | activity_completion | sum | 10 | LMS win |
| Nightmare x200 | kill_count | sum | 200 | The Nightmare |
| Zealot's Robes set | item_obtained | each | 1 | 4 robe pieces |
| 1000 Slayer boss kills | kill_count | sum | 1000 | **needs curated list — see below** |
| 200 Hunter Rumours | activity_completion | sum | 200 | Hunter rumour completion |
| 3x Sarachnis Cudgel | item_obtained | sum | 3 | Sarachnis cudgel |
| 3x Tormented Synapse | item_obtained | sum | 3 | Tormented synapse |
| 30x Huetycoatl Hide | item_obtained | sum | 30 | Huetycoatl hide |
| Fight Caves x10 | activity_completion | sum | 10 | Fight Caves completion |
| Get a Pet | activity_completion | sum | 1 | Pet received | **repeatable=true** |
| Royal Titans x300 | kill_count | sum | 300 | Royal Titans |
| GG unique drop | item_obtained | sum | 1 | Granite gloves/ring/hammer, Black tourmaline core |
| Dragon Warhammer | item_obtained | sum | 1 | Dragon warhammer |
| DK ring from each | item_obtained | each | 1 | Berserker/Archer/Warrior ring |
| 50 Medium Clues | activity_completion | sum | 50 | Medium clue casket |
| Dagon'hai piece | item_obtained | sum | 1 | hat/top/bottom |
| Angler's Paint | item_obtained | sum | 1 | Angler's paint |
| Corp Sigil | item_obtained | sum | 1 | Arcane/Spectral/Elysian sigil |
| Demonic Brutus | kill_count | sum | 1 | Demonic Brutus |
| Moons Armor (3 sets) | item_obtained | each | 1 | 9 armor pieces |
| Yama x150 | kill_count | sum | 150 | Yama |
| 50 Raids | activity_completion | sum | 50 | CoX/ToB/ToA completion — **assumes any raid counts** |

## Resolved

1. **Nightmare** — regular Nightmare, not Phosani's. `sources: ["The Nightmare"]`.
2. **"50 Raids" scope** — any of CoX/ToB/ToA counts toward one cumulative target of 50.
3. **Slayer boss list** — Shellbane Grypon, Grotesque Guardians, Abyssal Sire,
   Cerberus, Thermonuclear Smoke Devil, Alchemical Hydra.
4. **Repeatable pet tile scoring** — every pet is worth 3 bonus points, uncapped.
   `bonusPerRepeat: 3` on the tile.

The criteria schema is fully resolved for this board — no open questions left.
