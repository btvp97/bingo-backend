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
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "12h" });
}

export function verifyTeamToken(token: string): TeamTokenPayload {
  // Throws if the token is malformed, expired, or signed with a different secret.
  return jwt.verify(token, env.jwtSecret) as TeamTokenPayload;
}
