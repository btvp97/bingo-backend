import { PrismaClient } from "@prisma/client";
import fs from "fs";

const envText = fs.readFileSync(".env", "utf8");
const match = envText.match(/DATABASE_URL="?([^"\n]+)"?/);
process.env.DATABASE_URL = match[1];

const prisma = new PrismaClient();

const tiles = await prisma.tile.findMany({
  where: {
    OR: [
      { title: { contains: "goblin", mode: "insensitive" } },
      { title: { contains: "bone", mode: "insensitive" } },
      { title: { contains: "sapphire", mode: "insensitive" } },
    ],
  },
  select: {
    id: true, title: true, metric: true, mode: true, target: true,
    sources: true, repeatable: true, row: true, col: true, boardId: true,
  },
});

console.log(JSON.stringify(tiles, null, 2));
await prisma.$disconnect();
