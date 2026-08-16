import { open, readFile, rm } from "node:fs/promises";

type LeaseRecord = {
  active: boolean;
  activeUntil: number;
  cooldownUntil: number;
  ownerId: string;
};

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

export class FileControlledCallLease implements ControlledCallLease {
  private operations = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly now: () => number = Date.now,
    private readonly activeLifetimeMs = 5 * 60 * 1000,
    private readonly cooldownMs = 10 * 60 * 1000,
  ) {}

  acquire(ownerId: string) {
    return this.serialize(async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const current = await this.read();
        if (current?.active && current.activeUntil > this.now()) {
          throw new Error("A previous controlled call may still be active. Wait five minutes before trying again.");
        }
        if (current && current.cooldownUntil > this.now()) {
          throw new Error("Wait ten minutes before starting another controlled call.");
        }
        if (current) await rm(this.path, { force: true });

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
    });
  }

  replaceOwner(currentOwnerId: string, nextOwnerId: string) {
    return this.serialize(async () => {
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
    });
  }

  release(ownerId: string) {
    return this.serialize(async () => {
      const current = await this.read();
      if (!current || current.ownerId !== ownerId) return;
      const file = await open(this.path, "w");
      try {
        await file.writeFile(JSON.stringify({ ...current, active: false } satisfies LeaseRecord));
      } finally {
        await file.close();
      }
    });
  }

  cancel(ownerId: string) {
    return this.serialize(async () => {
      const current = await this.read();
      if (!current || current.ownerId !== ownerId) return;
      await rm(this.path, { force: true });
    });
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
}

export class MemoryControlledCallLease implements ControlledCallLease {
  private record: LeaseRecord | undefined;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly activeLifetimeMs = 5 * 60 * 1000,
    private readonly cooldownMs = 10 * 60 * 1000,
  ) {}

  async acquire(ownerId: string) {
    if (this.record?.active && this.record.activeUntil > this.now()) {
      throw new Error("A previous controlled call may still be active. Wait five minutes before trying again.");
    }
    if (this.record && this.record.cooldownUntil > this.now()) {
      throw new Error("Wait ten minutes before starting another controlled call.");
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
