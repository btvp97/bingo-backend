// Loads a board authored in the tile-criteria-schema.md JSON shape into the
// database. Run with `npm run seed` after `npm run prisma:migrate`.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

type SourceTile = {
  title: string;
  points: number;
  repeatable?: boolean;
  bonusPerRepeat?: number;
  criteria: { metric: string; mode: string; target: number; sources: string[] };
};

type SourceBoard = {
  boardName: string;
  bonuses: { horizontal: number; vertical: number; diagonal: number; blackout: number };
  tiles: SourceTile[];
};

async function main() {
  const raw = fs.readFileSync(
    path.join(__dirname, "fixtures", "misclickers-fall-bingo.json"),
    "utf-8"
  );
  const data: SourceBoard = JSON.parse(raw);

  // The source JSON doesn't carry a grid layout, just an ordered tile list.
  // Assuming a square-ish 5-column grid since 25 tiles / 5 = 5x5, the standard
  // bingo shape — worth double-checking against the live board if you seed a
  // board whose tile count doesn't divide evenly.
  const cols = 5;
  if (data.tiles.length % cols !== 0) {
    throw new Error(
      `Tile count ${data.tiles.length} doesn't divide evenly into ${cols} columns — set the grid size explicitly for this board.`
    );
  }
  const rows = data.tiles.length / cols;

  const clan = await prisma.clan.upsert({
    where: { id: "misclickers" },
    update: {},
    create: { id: "misclickers", name: "Misclickers" },
  });

  const board = await prisma.board.create({
    data: {
      clanId: clan.id,
      name: data.boardName,
      rows,
      cols,
      bonusHorizontal: data.bonuses.horizontal,
      bonusVertical: data.bonuses.vertical,
      bonusDiagonal: data.bonuses.diagonal,
      bonusBlackout: data.bonuses.blackout,
      status: "ACTIVE",
      tiles: {
        create: data.tiles.map((tile, index) => ({
          title: tile.title,
          points: tile.points,
          row: Math.floor(index / cols),
          col: index % cols,
          repeatable: tile.repeatable ?? false,
          bonusPerRepeat: tile.bonusPerRepeat ?? null,
          // The source JSON uses lowercase snake_case; the DB enum is UPPER_CASE.
          metric: tile.criteria.metric.toUpperCase() as "KILL_COUNT" | "ITEM_OBTAINED" | "ACTIVITY_COMPLETION",
          mode: tile.criteria.mode.toUpperCase() as "SUM" | "EACH",
          target: tile.criteria.target,
          sources: tile.criteria.sources,
        })),
      },
    },
    include: { tiles: true },
  });

  console.log(`Seeded board "${board.name}" (${board.id}) with ${board.tiles.length} tiles.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
