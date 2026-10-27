type LoadCallbacks<T> = {
  start: () => void;
  success: (value: T) => void;
  failure: (error: unknown) => void;
  settled: () => void;
};

/** A mounted account/session owns this gate. New reads, mutations and cleanup
 * invalidate older reads even when their transport ignores cancellation. */
export class CompanionLoadGate {
  private current?: AbortController;
  private revision = 0;

  invalidate() {
    const previous = this.current;
    this.current = undefined;
    this.revision++;
    previous?.abort();
  }

  async run<T>(read: (signal: AbortSignal) => Promise<T>, callbacks: LoadCallbacks<T>) {
    this.invalidate();
    const controller = new AbortController();
    const revision = this.revision;
    this.current = controller;
    const active = () => this.current === controller && this.revision === revision && !controller.signal.aborted;
    try {
      callbacks.start();
      const value = await read(controller.signal);
      if (active()) callbacks.success(value);
    } catch (error) {
      if (active()) callbacks.failure(error);
    } finally {
      if (active()) {
        this.current = undefined;
        callbacks.settled();
      }
    }
  }
}
