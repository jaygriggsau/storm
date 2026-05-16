import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const pool: Pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.POSTGRES_URL,
    max: 5
  });

if (process.env.NODE_ENV !== "production") global.__pgPool = pool;
