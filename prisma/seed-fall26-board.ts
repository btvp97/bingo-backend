// Loads prisma/fixtures/misclickers-fall-26-bingo.json into the database as
// the official "Misclickers Fall 26 Bingo" board — 25 placeholder tiles for
// now, filled in one at a time via prisma/set-tile.cjs as tile votes land.
//
// Same JSON shape as seed.ts/seed-test-board.ts (see
// docs/tile-criteria-schema.md), just this board's own fixture file, plus a
// pre-flight check so re-running this doesn't silently create a duplicate.
//
// Usage: npx tsx prisma/seed-fall26-board.ts
import { Prisma, PrismaClient } from "@prisma/client";
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
    target?: number;
    sources?: string[];
    sourceTargets?: Record<string, number>;
    groups?: AndOrGroup[];
    sets?: AndOrGroup[];
  };
};

type SourceBoard = {
  boardName: string;
  bonuses: { horizontal: number; vertical: number; diagonal: number; blackout: number };
  tiles: SourceTile[];
};

async function main() {
  const raw = fs.readFileSync(
    path.join(__dirname, "fixtures", "misclickers-fall-26-bingo.json"),
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
      `Not overwriting automatically — delete it first if you want a fresh copy.`
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
          mode: tile.criteria.mode.toUpperCase() as "SUM" | "EACH" | "AND_OR" | "OR_AND",
          target: tile.criteria.target ?? 1,
          sources:
            tile.criteria.mode === "and_or"
              ? [...new Set(tile.criteria.groups!.flatMap((g) => g.conditions.map((c) => c.source)))]
              : tile.criteria.mode === "or_and"
              ? [...new Set(tile.criteria.sets!.flatMap((s) => s.conditions.map((c) => c.source)))]
              : tile.criteria.sources!,
          sourceTargets: tile.criteria.sourceTargets ?? Prisma.DbNull,
          groups: tile.criteria.groups ?? Prisma.DbNull,
          sets: tile.criteria.sets ?? Prisma.DbNull,
        })),
      },
    },
    include: { tiles: true },
  });

  console.log(`Seeded board "${board.name}" (${board.id}) with ${board.tiles.length} tiles.`);
  console.log(`Create teams against it via POST /admin/boards/${board.id}/teams.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
