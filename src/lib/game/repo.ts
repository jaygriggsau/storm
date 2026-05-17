import { pool } from "@/lib/db";
import type { RunState } from "./types";
import { isCurrentSchema } from "./engine";

// Repository for run rows. Persistence is intentionally pessimistic:
// every action does a transactional `select ... for update` so concurrent
// requests from the same player can't race the same run into an
// inconsistent state.

export type LoadedRun = {
  state: RunState;
  version: number;
  lastAction: string | null;
};

export async function loadActiveRun(userId: string): Promise<LoadedRun | null> {
  const { rows } = await pool.query<{ state: RunState; version: number; last_action: string | null }>(
    `select state, version, last_action
       from runs
      where user_id = $1 and status = 'active'
      order by created_at desc
      limit 1`,
    [userId]
  );
  if (rows.length === 0) return null;
  const row = rows[0]!;
  if (!isCurrentSchema(row.state)) {
    // Schema bumped: drop the stale run rather than try to migrate.
    await discardActive(userId);
    return null;
  }
  return { state: row.state, version: row.version, lastAction: row.last_action };
}

export async function createRun(state: RunState): Promise<void> {
  await pool.query(
    `insert into runs (id, user_id, state, status, version, created_at, updated_at)
       values ($1, $2, $3, 'active', 0, now(), now())`,
    [state.id, state.userId, state]
  );
}

export async function discardActive(userId: string): Promise<void> {
  await pool.query(
    `update runs set status = 'abandoned', updated_at = now()
      where user_id = $1 and status = 'active'`,
    [userId]
  );
}

// Mutator wraps the read-modify-write cycle in a single transaction with
// `select for update`, and supports an idempotency key so a retried
// request from a flaky network does not apply the same action twice.
export async function mutateActiveRun(
  userId: string,
  idempotencyKey: string | null,
  mutate: (state: RunState) => void
): Promise<{ state: RunState; status: string }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{
      id: string;
      state: RunState;
      version: number;
      status: string;
      last_action: string | null;
    }>(
      `select id, state, version, status, last_action
         from runs
        where user_id = $1 and status = 'active'
        order by created_at desc
        limit 1
        for update`,
      [userId]
    );
    if (rows.length === 0) throw new NotFound("no active run");
    const row = rows[0]!;
    if (!isCurrentSchema(row.state)) {
      await client.query(
        `update runs set status = 'abandoned', updated_at = now() where id = $1`,
        [row.id]
      );
      await client.query("commit");
      throw new NotFound("run schema is outdated; start a new run");
    }

    if (idempotencyKey && row.last_action === idempotencyKey) {
      // Replay: return the row as-is.
      await client.query("commit");
      return { state: row.state, status: row.status };
    }

    mutate(row.state);

    const newStatus =
      row.state.phase === "victory" ? "victory" :
      row.state.phase === "defeat" ? "defeat" :
      "active";

    await client.query(
      `update runs
          set state = $1,
              status = $2,
              version = version + 1,
              last_action = $3,
              updated_at = now()
        where id = $4`,
      [row.state, newStatus, idempotencyKey, row.id]
    );
    await client.query("commit");
    return { state: row.state, status: newStatus };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export class NotFound extends Error {
  status = 404;
}
