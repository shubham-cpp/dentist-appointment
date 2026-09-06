import { createHash, randomUUID } from "node:crypto";
import { open, readFile, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function controlledCallLeasePath(input: { connectionId: string; from: string; to: string }) {
  const key = createHash("sha256")
    .update(`${input.connectionId}\u0000${input.from}\u0000${input.to}`)
    .digest("hex")
    .slice(0, 24);
  return join(tmpdir(), `dentist-voice-experiment-${key}.json`);
}

type LeaseRecord = {
  active: boolean;
  activeUntil: number;
  cooldownUntil: number;
  ownerId: string;
};

type OperationLockRecord = {
  expiresAt: number;
  ownerId: string;
  pid: number;
};

const operationLockLifetimeMs = 30_000;

export type ControlledCallLease = {
  acquire(ownerId: string): Promise<void>;
  cancel(ownerId: string): Promise<void>;
  release(ownerId: string): Promise<void>;
  replaceOwner(currentOwnerId: string, nextOwnerId: string): Promise<void>;
};

function isMissingFile(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "ENOENT";
}

function parseLeaseRecord(contents: string): LeaseRecord {
  const record = JSON.parse(contents) as Partial<LeaseRecord>;
  if (
    typeof record.ownerId !== "string"
    || typeof record.active !== "boolean"
    || typeof record.activeUntil !== "number"
    || typeof record.cooldownUntil !== "number"
  ) {
    throw new Error("The controlled call safety lock is invalid. Remove it only after confirming no call is active.");
  }
  return {
    active: record.active,
    activeUntil: record.activeUntil,
    cooldownUntil: record.cooldownUntil,
    ownerId: record.ownerId,
  };
}

function parseOperationLockRecord(contents: string): OperationLockRecord | undefined {
  try {
    const record = JSON.parse(contents) as Partial<OperationLockRecord>;
    if (
      typeof record.ownerId !== "string"
      || !Number.isInteger(record.pid)
      || record.pid! <= 0
      || !Number.isFinite(record.expiresAt)
    ) return undefined;
    return {
      expiresAt: record.expiresAt!,
      ownerId: record.ownerId,
      pid: record.pid!,
    };
  } catch {
    return undefined;
  }
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "EPERM";
  }
}

export class FileControlledCallLease implements ControlledCallLease {
  private operations = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly now: () => number = Date.now,
    private readonly activeLifetimeMs = 5 * 60 * 1000,
    private readonly cooldownMs = 4 * 60 * 1000,
  ) {}

  acquire(ownerId: string) {
    return this.serialize(() => this.withOperationLock(async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const current = await this.read();
        if (current?.active && current.activeUntil > this.now()) {
          throw new Error("A previous controlled call may still be active. Wait five minutes before trying again.");
        }
        if (current && current.cooldownUntil > this.now()) {
          throw new Error("Wait four minutes before starting another controlled call.");
        }
        if (current) await unlink(this.path);

        try {
          const file = await open(this.path, "wx");
          try {
            await file.writeFile(JSON.stringify({
              active: true,
              activeUntil: this.now() + this.activeLifetimeMs,
              cooldownUntil: this.now() + this.cooldownMs,
              ownerId,
            } satisfies LeaseRecord));
          } finally {
            await file.close();
          }
          return;
        } catch (error) {
          if (!this.isAlreadyLocked(error)) throw error;
        }
      }

      throw new Error("A previous controlled call may still be active. Wait five minutes before trying again.");
    }));
  }

  replaceOwner(currentOwnerId: string, nextOwnerId: string) {
    return this.serialize(() => this.withOperationLock(async () => {
      const current = await this.read();
      if (!current || current.ownerId !== currentOwnerId) {
        throw new Error("The controlled call safety lock changed before the call could start.");
      }

      const file = await open(this.path, "w");
      try {
        await file.writeFile(JSON.stringify({ ...current, ownerId: nextOwnerId } satisfies LeaseRecord));
      } finally {
        await file.close();
      }
    }));
  }

  release(ownerId: string) {
    return this.serialize(() => this.withOperationLock(async () => {
      const current = await this.read();
      if (!current || current.ownerId !== ownerId) return;
      const file = await open(this.path, "w");
      try {
        await file.writeFile(JSON.stringify({ ...current, active: false } satisfies LeaseRecord));
      } finally {
        await file.close();
      }
    }));
  }

  cancel(ownerId: string) {
    return this.serialize(() => this.withOperationLock(async () => {
      const current = await this.read();
      if (!current || current.ownerId !== ownerId) return;
      await unlink(this.path);
    }));
  }

  private async read() {
    try {
      return parseLeaseRecord(await readFile(this.path, "utf8"));
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
  }

  private isAlreadyLocked(error: unknown) {
    return typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "EEXIST";
  }

  private async serialize<T>(operation: () => Promise<T>) {
    const next = this.operations.then(operation, operation);
    this.operations = next.then(() => undefined, () => undefined);
    return next;
  }

  private async withOperationLock<T>(operation: () => Promise<T>) {
    const lockPath = `${this.path}.operation-lock`;
    let lock: Awaited<ReturnType<typeof open>> | undefined;
    let ownerId: string | undefined;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        lock = await open(lockPath, "wx", 0o600);
        ownerId = randomUUID();
        await lock.writeFile(JSON.stringify({
          expiresAt: this.now() + operationLockLifetimeMs,
          ownerId,
          pid: process.pid,
        } satisfies OperationLockRecord));
        break;
      } catch (error) {
        if (lock) {
          await lock.close().catch(() => undefined);
          lock = undefined;
          await unlink(lockPath).catch(() => undefined);
          throw error;
        }
        if (!this.isAlreadyLocked(error)) throw error;
        if (await this.recoverStaleOperationLock(lockPath)) continue;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    if (!lock) {
      throw new Error("The controlled call safety lock is busy. Try again.");
    }

    try {
      return await operation();
    } finally {
      await lock.close();
      await this.removeOwnedOperationLock(lockPath, ownerId!);
    }
  }

  private async recoverStaleOperationLock(lockPath: string) {
    let observed: string;
    try {
      observed = await readFile(lockPath, "utf8");
    } catch (error) {
      if (isMissingFile(error)) return true;
      throw error;
    }
    const record = parseOperationLockRecord(observed);
    if (!record) {
      const fileStats = await stat(lockPath);
      if (Date.now() - fileStats.mtimeMs <= operationLockLifetimeMs) return false;
    } else if (record.expiresAt > this.now() && isProcessAlive(record.pid)) {
      return false;
    }

    try {
      if (await readFile(lockPath, "utf8") !== observed) return false;
      await unlink(lockPath);
      return true;
    } catch (error) {
      if (isMissingFile(error)) return true;
      throw error;
    }
  }

  private async removeOwnedOperationLock(lockPath: string, ownerId: string) {
    try {
      const current = parseOperationLockRecord(await readFile(lockPath, "utf8"));
      if (current?.ownerId === ownerId) await unlink(lockPath);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }
}

export class MemoryControlledCallLease implements ControlledCallLease {
  private record: LeaseRecord | undefined;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly activeLifetimeMs = 5 * 60 * 1000,
    private readonly cooldownMs = 4 * 60 * 1000,
  ) {}

  async acquire(ownerId: string) {
    if (this.record?.active && this.record.activeUntil > this.now()) {
      throw new Error("A previous controlled call may still be active. Wait five minutes before trying again.");
    }
    if (this.record && this.record.cooldownUntil > this.now()) {
      throw new Error("Wait four minutes before starting another controlled call.");
    }
    this.record = {
      active: true,
      activeUntil: this.now() + this.activeLifetimeMs,
      cooldownUntil: this.now() + this.cooldownMs,
      ownerId,
    };
  }

  async replaceOwner(currentOwnerId: string, nextOwnerId: string) {
    if (this.record?.ownerId !== currentOwnerId) {
      throw new Error("The controlled call safety lock changed before the call could start.");
    }
    this.record.ownerId = nextOwnerId;
  }

  async release(ownerId: string) {
    if (this.record?.ownerId === ownerId) this.record.active = false;
  }

  async cancel(ownerId: string) {
    if (this.record?.ownerId === ownerId) this.record = undefined;
  }
}
