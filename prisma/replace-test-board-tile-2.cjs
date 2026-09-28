// One-off utility: replaces a second tile on the Test Board in place, this
// time with an AND_OR mode tile — "(Obtain bones OR obtain big bones) AND
// (obtain ashes OR obtain a chef's hat)" — to test the new nested-group
// logic end to end. Same in-place-update approach as
// replace-test-board-tile.cjs (doesn't touch other tiles or team progress).
//
// Requires the AND_OR migration (20260928130000_add_tile_and_or_groups) to
// already be applied — run `npm run prisma:migrate` first if this errors
// about an unknown column or enum value.
//
// .cjs extension is deliberate: package.json has "type": "module", so a
// plain .js file here would be loaded as an ES module and require() would
// fail — .cjs forces CommonJS regardless of that setting.
//
// Usage: node prisma/replace-test-board-tile-2.cjs
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
const OLD_TILE_TITLE = "Kill 10 Al-Kharid Warriors";

const groups = [
  { conditions: [{ source: "Bones", target: 1 }, { source: "Big bones", target: 1 }] },
  { conditions: [{ source: "Ashes", target: 1 }, { source: "Chef's hat", target: 1 }] },
];

const NEW_TILE = {
  title: "Obtain Bones/Big Bones AND Ashes/Chef's Hat",
  points: 1,
  repeatable: false,
  metric: "ITEM_OBTAINED",
  mode: "AND_OR",
  target: 1, // unused placeholder for this mode
  sources: [...new Set(groups.flatMap((g) => g.conditions.map((c) => c.source)))],
  sourceTargets: null,
  groups,
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
