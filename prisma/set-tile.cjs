// Reusable utility: replaces ONE tile on a board in place, by its row/col
// grid position, from a small JSON file describing the new tile. Doesn't
// touch any other tile, and clears any stale TileProgress for that specific
// tile slot (since old progress from a placeholder or a previous tile there
// doesn't apply to whatever's replacing it).
//
// Meant to be run repeatedly as each bingo-board tile gets voted on and
// finalized — unlike the one-off replace-test-board-tile*.cjs scripts this
// generalizes, this one is meant to stick around.
//
// Tile JSON shape (same "criteria" shape as prisma/fixtures/*.json):
//   {
//     "title": "Kill the Nightmare 200 Times",
//     "points": 5,
//     "repeatable": false,
//     "criteria": { "metric": "kill_count", "mode": "sum", "target": 200, "sources": ["The Nightmare"] }
//   }
// mode "each" also accepts "sourceTargets"; mode "and_or" uses "groups"
// instead of target/sources — see docs/tile-criteria-schema.md.
//
// Usage: node prisma/set-tile.cjs "<Board Name>" <row> <col> <path-to-tile.json>
// Example: node prisma/set-tile.cjs "Misclickers Fall 26 Bingo" 0 0 tile-0-0.json

const fs = require("fs");

const [, , boardName, rowArg, colArg, tileJsonPath] = process.argv;

if (!boardName || rowArg === undefined || colArg === undefined || !tileJsonPath) {
  console.log('Usage: node prisma/set-tile.cjs "<Board Name>" <row> <col> <path-to-tile.json>');
  process.exit(1);
}

const row = Number(rowArg);
const col = Number(colArg);
if (!Number.isInteger(row) || !Number.isInteger(col)) {
  console.log("row and col must be integers (0-indexed).");
  process.exit(1);
}

const tileSource = JSON.parse(fs.readFileSync(tileJsonPath, "utf8"));

const envText = fs.readFileSync(".env", "utf8");
const match = envText.match(/DATABASE_URL="?([^"\n]+)"?/);
if (match) {
  process.env.DATABASE_URL = match[1];
}

const { Prisma, PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function buildTileData(tile) {
  const criteria = tile.criteria;
  const isAndOr = criteria.mode === "and_or";
  return {
    title: tile.title,
    points: tile.points,
    repeatable: tile.repeatable ?? false,
    bonusPerRepeat: tile.bonusPerRepeat ?? null,
    metric: criteria.metric.toUpperCase(),
    mode: criteria.mode.toUpperCase(),
    target: criteria.target ?? 1,
    sources: isAndOr
      ? [...new Set(criteria.groups.flatMap((g) => g.conditions.map((c) => c.source)))]
      : criteria.sources,
    sourceTargets: criteria.sourceTargets ?? Prisma.DbNull,
    groups: criteria.groups ?? Prisma.DbNull,
  };
}

(async () => {
  const board = await prisma.board.findFirst({ where: { name: boardName } });
  if (!board) {
    console.log(`No board found named "${boardName}". Check the exact name.`);
    await prisma.$disconnect();
    return;
  }

  const tile = await prisma.tile.findUnique({
    where: { boardId_row_col: { boardId: board.id, row, col } },
  });
  if (!tile) {
    console.log(`No tile at row ${row}, col ${col} on "${boardName}" (${board.id}).`);
    await prisma.$disconnect();
    return;
  }

  const deleted = await prisma.tileProgress.deleteMany({ where: { tileId: tile.id } });

  const updated = await prisma.tile.update({
    where: { id: tile.id },
    data: buildTileData(tileSource),
  });

  console.log(`Board: ${board.name} (${board.id})`);
  console.log(`Replaced tile at row ${row}, col ${col}: "${tile.title}" -> "${updated.title}"`);
  console.log(`Cleared ${deleted.count} existing TileProgress row(s) for that slot.`);

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
