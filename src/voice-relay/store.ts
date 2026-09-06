import { createRequire } from "node:module";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ControlledVoiceAttempt } from "@/lib/controlled-voice-attempt";
import type { VoiceCallContext } from "@/lib/voice-call-context";

// Node's built-in SQLite is available in the supported local Node runtime.
type Database = {
  exec(sql: string): void;
  prepare(sql: string): { run(...values: unknown[]): unknown; get(...values: unknown[]): unknown; all(...values: unknown[]): unknown[] };
  close(): void;
};
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };

export type StoredRelayAttempt = {
  view: ControlledVoiceAttempt;
  archived?: boolean;
  requestId: string;
  context: VoiceCallContext;
  token: string;
  callSid?: string;
  callback?: unknown;
  state?: unknown;
  cooldownUntil: number;
};

export class RelayStore {
  private readonly db: Database;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS relay_attempts (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, updated TEXT NOT NULL, body TEXT NOT NULL);`);
  }
  save(attempt: StoredRelayAttempt) {
    this.db.prepare(`INSERT INTO relay_attempts VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET updated=excluded.updated, body=excluded.body`).run(
      attempt.view.id, attempt.requestId, attempt.view.updatedAt, JSON.stringify(attempt));
  }
  get(id: string): StoredRelayAttempt | undefined {
    const row = this.db.prepare("SELECT body FROM relay_attempts WHERE id=?").get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  byRequest(id: string): StoredRelayAttempt | undefined {
    const row = this.db.prepare("SELECT body FROM relay_attempts WHERE request_id=?").get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  all(): StoredRelayAttempt[] {
    return (this.db.prepare("SELECT body FROM relay_attempts ORDER BY updated DESC").all() as Array<{ body: string }>).map(row => JSON.parse(row.body));
  }
  close() { this.db.close(); }
}
