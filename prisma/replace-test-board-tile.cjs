// One-off utility: replaces a single tile on the Test Board in place (rather
// than re-seeding the whole board, which would wipe every team's existing
// progress). Used here to swap in the "Kill 2 Goblins and 3 Chickens"
// per-source-target test tile in place of "Kill 10 Dwarves".
//
// Requires the sourceTargets migration (20260928120000_add_tile_source_targets)
// to already be applied — run `npm run prisma:migrate` (or `prisma:deploy`)
// first if this errors about an unknown column.
//
// .cjs extension is deliberate: package.json has "type": "module", so a
// plain .js file here would be loaded as an ES module and require() would
// fail — .cjs forces CommonJS regardless of that setting.
//
// Usage: node prisma/replace-test-board-tile.cjs
// Safe to delete this file after running it.

const fs = require("fs");

const envText = fs.readFileSync(".env", "utf8");
const match = envText.match(/DATABASE_URL="?([^"\n]+)"?/);
if (match) {
  process.env.DATABASE_URL = match[1];
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BOARD_NAME = "Test Board";
const OLD_TILE_TITLE = "Kill 10 Dwarves";

const NEW_TILE = {
  title: "Kill 2 Goblins and 3 Chickens",
  points: 1,
  repeatable: false,
  metric: "KILL_COUNT",
  mode: "EACH",
  target: 3, // fallback only — sourceTargets below covers both sources explicitly
  sources: ["Goblin", "Chicken"],
  sourceTargets: { Goblin: 2, Chicken: 3 },
};

(async () => {
  const board = await prisma.board.findFirst({ where: { name: BOARD_NAME } });
  if (!board) {
    console.log(`No board found named "${BOARD_NAME}". Check the exact name and update BOARD_NAME at the top of this script.`);
    await prisma.$disconnect();
    return;
  }

  const tile = await prisma.tile.findFirst({ where: { boardId: board.id, title: OLD_TILE_TITLE } });
  if (!tile) {
    console.log(`No tile titled "${OLD_TILE_TITLE}" found on "${BOARD_NAME}" (${board.id}). Check the exact title and update OLD_TILE_TITLE at the top of this script.`);
    await prisma.$disconnect();
    return;
  }

  const deleted = await prisma.tileProgress.deleteMany({ where: { tileId: tile.id } });

  const updated = await prisma.tile.update({
    where: { id: tile.id },
    data: NEW_TILE,
  });

  console.log(`Board: ${board.name} (${board.id})`);
  console.log(`Replaced tile at row ${updated.row}, col ${updated.col}: "${OLD_TILE_TITLE}" -> "${updated.title}"`);
  console.log(`Cleared ${deleted.count} existing TileProgress row(s) for that tile (stale progress from the old criteria).`);

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
