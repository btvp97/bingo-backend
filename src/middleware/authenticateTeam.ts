import type { NextFunction, Request, Response } from "express";
import { type TeamTokenPayload, verifyTeamToken } from "../auth.js";

export interface AuthedRequest extends Request {
  team?: TeamTokenPayload;
}

// Reads "Authorization: Bearer <token>", verifies it, and attaches the
// decoded { teamId, boardId, rsn } to req.team for downstream handlers.
export function authenticateTeam(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }
  try {
    req.team = verifyTeamToken(header.slice("Bearer ".length));
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
