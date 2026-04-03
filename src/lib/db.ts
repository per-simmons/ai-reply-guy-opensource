import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb() {
  const { env } = await getCloudflareContext();
  return env.DB as D1Database;
}

// Helper to get a single row
export async function dbGet<T>(
  db: D1Database,
  query: string,
  ...params: unknown[]
): Promise<T | null> {
  const result = await db
    .prepare(query)
    .bind(...params)
    .first<T>();
  return result;
}

// Helper to get multiple rows
export async function dbAll<T>(
  db: D1Database,
  query: string,
  ...params: unknown[]
): Promise<T[]> {
  const result = await db
    .prepare(query)
    .bind(...params)
    .all<T>();
  return result.results;
}

// Helper to run a mutation
export async function dbRun(
  db: D1Database,
  query: string,
  ...params: unknown[]
) {
  return db.prepare(query).bind(...params).run();
}
