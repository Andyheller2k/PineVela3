/** Coalesce poll/focus/event refreshes for one account generation. */
export class AccountRefreshGate {
  private active?: { key: string; generation: number; controller: AbortController; promise: Promise<void> };

  run(key: string, generation: number, work: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.active?.key === key && this.active.generation === generation) return this.active.promise;
    this.cancel();
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => {
      if (!controller.signal.aborted) return work(controller.signal);
    }).finally(() => {
      if (this.active?.promise === promise) this.active = undefined;
    });
    this.active = { key, generation, controller, promise };
    return promise;
  }

  cancel(): void {
    this.active?.controller.abort();
    this.active = undefined;
  }
}
