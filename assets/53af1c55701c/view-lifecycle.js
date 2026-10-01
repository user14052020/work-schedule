/** A view owns its reads. Late responses cannot repaint a newer screen or selection. */
export class ViewLifecycle {
  constructor() { this.disposed = false; this.generation = 0; this.controller = null; }
  begin() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const generation = ++this.generation;
    return {signal:controller.signal,current:() => !this.disposed && generation === this.generation};
  }
  dispose() { this.disposed = true; this.generation++; this.controller?.abort(); }
}
