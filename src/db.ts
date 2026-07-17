import { PrismaClient } from "@prisma/client";

// Prisma Client is a single connection-pooled client meant to be reused across
// the whole process, not created per-request — hence the shared singleton here.
export const prisma = new PrismaClient();
