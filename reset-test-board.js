// One-off utility: resets tile progress for every team on the Test Board
// back to zero/incomplete. Leaves CompletionEvent (the audit log) untouched.
//
// Usage: node reset-test-board.js
// Safe to delete this file after running it.

const fs = require("fs");

const envText = fs.readFileSync(".env", "utf8");
const match = envText.match(/DATABASE_URL="?([^"\n]+)"?/);
if (match) {
  process.env.DATABASE_URL = match[1];
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Adjust this if your board's exact name in Prisma Studio is different.
const BOARD_NAME = "Test Board";

(async () => {
  const board = await prisma.board.findFirst({ where: { name: BOARD_NAME } });
  if (!board) {
    console.log(`No board found named "${BOARD_NAME}". Check the exact name in Prisma Studio and update BOARD_NAME at the top of this script.`);
    await prisma.$disconnect();
    return;
  }

  const teams = await prisma.team.findMany({ where: { boardId: board.id } });
  const tiles = await prisma.tile.findMany({ where: { boardId: board.id } });

  const result = await prisma.tileProgress.deleteMany({
    where: {
      teamId: { in: teams.map((t) => t.id) },
      tileId: { in: tiles.map((t) => t.id) },
    },
  });

  console.log(`Board: ${board.name} (${board.id})`);
  console.log(`Teams reset: ${teams.map((t) => t.name).join(", ") || "(none joined yet)"}`);
  console.log(`TileProgress rows deleted: ${result.count}`);
  console.log("CompletionEvent history left untouched.");

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
