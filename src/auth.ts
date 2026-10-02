import jwt from "jsonwebtoken";
import { env } from "./env.js";

// What gets encoded into a player's session token after they join a team.
// Every authenticated request (REST or WebSocket) carries this.
export type TeamTokenPayload = {
  teamId: string;
  boardId: string;
  rsn: string;
};

export function signTeamToken(payload: TeamTokenPayload): string {
  // Was 12h — too short for a RuneLite client left open across multiple play
  // sessions (the plugin had no way to recover from an expired token short
  // of the player manually restarting it in settings). 30 days comfortably
  // outlasts any realistic client uptime; the plugin also now auto-rejoins
  // on a 401 as a backstop, so this doesn't need to be exactly right.
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "30d" });
}

export function verifyTeamToken(token: string): TeamTokenPayload {
  // Throws if the token is malformed, expired, or signed with a different secret.
  return jwt.verify(token, env.jwtSecret) as TeamTokenPayload;
}
