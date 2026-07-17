import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}. Did you copy .env.example to .env?`);
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  adminSecret: required("ADMIN_SECRET"),
  port: Number(process.env.PORT ?? 4000),
};
