-- AlterEnum
ALTER TYPE "Mode" ADD VALUE 'AND_OR';

-- AlterTable
ALTER TABLE "Tile" ADD COLUMN     "groups" JSONB;
