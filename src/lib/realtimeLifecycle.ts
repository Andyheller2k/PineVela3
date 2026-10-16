/** Own one live connection and its retry timer for a mounted account scope. */
export class RealtimeLifecycle {
  private disposed = false;
  private closeCurrent?: () => void;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly connect: (retryAfter: (delayMs: number) => void) => () => void) {}

  start(): void {
    if (this.disposed || this.closeCurrent) return;
    clearTimeout(this.timer); this.timer = undefined;
    try { this.closeCurrent = this.connect(delay => this.retryAfter(delay)); }
    catch { this.retryAfter(5000); }
  }

  retryAfter(delayMs: number): void {
    if (this.disposed) return;
    this.close(); clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; this.start(); }, delayMs);
  }

  stop(): void {
    this.disposed = true; clearTimeout(this.timer); this.timer = undefined;
    this.close();
  }

  private close(): void {
    const close = this.closeCurrent; this.closeCurrent = undefined; close?.();
  }
}
