// One-off utility: sets iconItemId on the "Bury Bones" test tile so the
// plugin renders the real Bones item sprite instead of the tile's text
// title. Requires the iconItemId migration to already be applied (run
// `npx prisma migrate dev --name add_tile_icon_item_id` first).
//
// Usage: node set-bones-icon.js
// Safe to delete this file after running it.

import fs from "fs";
import { PrismaClient } from "@prisma/client";

const envText = fs.readFileSync(".env", "utf8");
const match = envText.match(/DATABASE_URL="?([^"\n]+)"?/);
if (match) {
  process.env.DATABASE_URL = match[1];
}

const prisma = new PrismaClient();

// OSRS item ID for "Bones" (the basic Prayer-training item, not Bones Ash
// or a boss-specific bone item). Matches net.runelite.api.gameval.ItemID.BONES
// on the plugin side.
const BONES_ITEM_ID = 526;

(async () => {
  const tiles = await prisma.tile.findMany({
    where: { title: { contains: "bone", mode: "insensitive" } },
  });

  if (tiles.length === 0) {
    console.log('No tile found with "bone" in its title. Check the exact title in Prisma Studio.');
    await prisma.$disconnect();
    return;
  }

  for (const tile of tiles) {
    await prisma.tile.update({
      where: { id: tile.id },
      data: { iconItemId: BONES_ITEM_ID },
    });
    console.log(`Set iconItemId=${BONES_ITEM_ID} on tile "${tile.title}" (${tile.id})`);
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
