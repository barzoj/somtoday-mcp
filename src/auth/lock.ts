import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";

export interface SessionLock {
  withLock<T>(run: () => Promise<T>): Promise<T>;
}

/** In-process only. Used by tests and when no lock path is configured. */
export class NoopLock implements SessionLock {
  withLock<T>(run: () => Promise<T>): Promise<T> {
    return run();
  }
}

/**
 * Cross-process mutex on a lock file (`open(..., "wx")`).
 * Somtoday refresh tokens are single-use, so two processes (e.g. two MCP
 * clients) must never refresh with the same token at the same time.
 */
export class FileLock implements SessionLock {
  constructor(
    private readonly path: string,
    private readonly options: {
      timeoutMs?: number;
      staleMs?: number;
      pollMs?: number;
      clock?: () => number;
    } = {},
  ) {}

  async withLock<T>(run: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await run();
    } finally {
      await unlink(this.path).catch(() => undefined);
    }
  }

  private async acquire(): Promise<void> {
    const timeoutMs = this.options.timeoutMs ?? 30_000;
    const staleMs = this.options.staleMs ?? 60_000;
    const pollMs = this.options.pollMs ?? 100;
    const clock = this.options.clock ?? Date.now;
    const deadline = clock() + timeoutMs;
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    for (;;) {
      try {
        const handle = await open(this.path, "wx", 0o600);
        await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
        await handle.close();
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
      }
      if (await this.isStale(staleMs, clock)) {
        await unlink(this.path).catch(() => undefined);
        continue;
      }
      if (clock() >= deadline) {
        throw new Error(
          `Timed out waiting for the session lock (${this.path}). If no other somtoday-mcp process is running, delete that file.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  private async isStale(
    staleMs: number,
    clock: () => number,
  ): Promise<boolean> {
    try {
      const info = await stat(this.path);
      if (clock() - info.mtimeMs > staleMs) {
        return true;
      }
      const pid = Number((await readFile(this.path, "utf8")).split(" ")[0]);
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
        try {
          process.kill(pid, 0);
        } catch (error) {
          // ESRCH: the holder is gone. EPERM: it exists but belongs to someone else.
          return (error as NodeJS.ErrnoException).code === "ESRCH";
        }
      }
      return false;
    } catch {
      // Vanished between open() and stat(): just retry.
      return false;
    }
  }
}
