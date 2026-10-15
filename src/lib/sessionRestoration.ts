/** Coordinate cookie-backed restoration without aborting a token refresh. */
export class SessionCheckUnavailable extends Error {}

export type RestorationResult<T> =
  | { kind: 'restored'; user: T }
  | { kind: 'signed-out' | 'unavailable' | 'superseded' };

export class SessionRestoration<T> {
  private epoch = 0;
  private pending?: { epoch: number; promise: Promise<RestorationResult<T>> };

  get generation(): number { return this.epoch; }
  invalidate(): void { this.epoch++; }

  async settled(): Promise<void> { await this.pending?.promise; }

  run(check: () => Promise<T | null>): Promise<RestorationResult<T>> {
    if (this.pending?.epoch === this.epoch) return this.pending.promise;
    const epoch = this.epoch, previous = this.pending?.promise;
    const promise = Promise.resolve().then(async (): Promise<RestorationResult<T>> => {
      // Let an older response finish delivering any rotated HttpOnly cookies.
      await previous;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (epoch !== this.epoch) return { kind: 'superseded' };
        try {
          const user = await check();
          if (epoch !== this.epoch) return { kind: 'superseded' };
          return user === null ? { kind: 'signed-out' } : { kind: 'restored', user };
        } catch (error) {
          if (epoch !== this.epoch) return { kind: 'superseded' };
          if (!(error instanceof SessionCheckUnavailable) || attempt === 2) return { kind: 'unavailable' };
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
      return { kind: 'unavailable' };
    }).finally(() => {
      if (this.pending?.promise === promise) this.pending = undefined;
    });
    this.pending = { epoch, promise };
    return promise;
  }
}
