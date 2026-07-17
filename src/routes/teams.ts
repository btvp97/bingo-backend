import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { signTeamToken } from "../auth.js";

const router = Router();

const joinSchema = z.object({
  joinCode: z.string(),
  rsn: z.string().min(1).max(12), // OSRS display names are capped at 12 characters
});

// POST /teams/join { joinCode, rsn }
// This is what the plugin calls when a player enters their team's join code
// in the config panel. Open-join: the first time an RSN shows up with a valid
// code, it's added to the team automatically.
router.post("/join", async (req, res) => {
  const parsed = joinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { joinCode, rsn } = parsed.data;

  const team = await prisma.team.findUnique({ where: { joinCode } });
  if (!team) {
    res.status(404).json({ error: "Invalid join code" });
    return;
  }

  await prisma.teamMember.upsert({
    where: { teamId_rsn: { teamId: team.id, rsn } },
    update: {},
    create: { teamId: team.id, rsn },
  });

  const token = signTeamToken({ teamId: team.id, boardId: team.boardId, rsn });
  res.json({ token, teamId: team.id, teamName: team.name, boardId: team.boardId });
});

export default router;
