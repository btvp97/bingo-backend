// Loads prisma/fixtures/test-board-early-game.json into the database as a
// new Board named "Test Board" — matches the name reset-test-board.js
// expects, so that script keeps working against this board unmodified.
//
// Same JSON shape as seed.ts/misclickers-fall-bingo.json (see
// docs/tile-criteria-schema.md), just a different fixture file and a
// pre-flight check so re-running this doesn't silently create duplicates.
//
// Usage: npx tsx prisma/seed-test-board.ts
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

type AndOrGroup = { conditions: { source: string; target: number }[] };

type SourceTile = {
  title: string;
  points: number;
  repeatable?: boolean;
  bonusPerRepeat?: number;
  criteria: {
    metric: string;
    mode: string;
    // Required for sum/each; unused (and may be omitted) for and_or.
    target?: number;
    sources?: string[];
    sourceTargets?: Record<string, number>;
    // and_or mode only.
    groups?: AndOrGroup[];
  };
};

type SourceBoard = {
  boardName: string;
  bonuses: { horizontal: number; vertical: number; diagonal: number; blackout: number };
  tiles: SourceTile[];
};

async function main() {
  const raw = fs.readFileSync(
    path.join(__dirname, "fixtures", "test-board-early-game.json"),
    "utf-8"
  );
  const data: SourceBoard = JSON.parse(raw);

  const cols = 5;
  if (data.tiles.length % cols !== 0) {
    throw new Error(
      `Tile count ${data.tiles.length} doesn't divide evenly into ${cols} columns — set the grid size explicitly for this board.`
    );
  }
  const rows = data.tiles.length / cols;

  const existing = await prisma.board.findFirst({ where: { name: data.boardName } });
  if (existing) {
    console.log(
      `A board named "${data.boardName}" already exists (${existing.id}). ` +
      `Delete it first (or rename this fixture's boardName) if you want a fresh copy — not overwriting automatically.`
    );
    await prisma.$disconnect();
    return;
  }

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
          metric: tile.criteria.metric.toUpperCase() as "KILL_COUNT" | "ITEM_OBTAINED" | "ACTIVITY_COMPLETION",
          mode: tile.criteria.mode.toUpperCase() as "SUM" | "EACH" | "AND_OR",
          target: tile.criteria.target ?? 1,
          sources:
            tile.criteria.mode === "and_or"
              ? [...new Set(tile.criteria.groups!.flatMap((g) => g.conditions.map((c) => c.source)))]
              : tile.criteria.sources!,
          sourceTargets: tile.criteria.sourceTargets ?? null,
          groups: tile.criteria.groups ?? null,
        })),
      },
    },
    include: { tiles: true },
  });

  console.log(`Seeded board "${board.name}" (${board.id}) with ${board.tiles.length} tiles.`);
  console.log(`Create a team against it via POST /admin/boards/${board.id}/teams.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
