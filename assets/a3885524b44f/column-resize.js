const minimumWidth = 45;
const maximumWidth = 800;
const clampWidth = width => Math.max(minimumWidth,Math.min(maximumWidth,width));

export class ColumnResizer {
  constructor(table,{savedWidth,saveWidth,onResize,fitToContainer = true}) {
    this.table = table; this.saveWidth = saveWidth; this.onResize = onResize; this.frame = 0;
    this.columns = [...table.querySelectorAll('col[data-width]')];
    this.baseWidths = this.columns.map(column => Math.max(minimumWidth,parseFloat(column.style.width) || minimumWidth));
    const hasSavedWidths = this.columns.some(column => {
      const width = Number(savedWidth(column.dataset.width));
      return Number.isFinite(width) && width > 0;
    });
    if (hasSavedWidths || !fitToContainer) this.setTableWidth();
    else if (table.parentElement) {
      this.fitAvailableWidth();
      this.observer = new ResizeObserver(() => this.fitAvailableWidth());
      this.observer.observe(table.parentElement);
    }
    this.pointerDown = event => this.start(event);
    this.keyDown = event => this.keyboard(event);
    this.click = event => {
      if (!event.target.closest('[data-resize]')) return;
      event.preventDefault(); event.stopImmediatePropagation();
    };
    table.addEventListener('pointerdown',this.pointerDown);
    table.addEventListener('keydown',this.keyDown);
    table.addEventListener('click',this.click,true);
  }
  fitAvailableWidth() {
    const availableWidth = this.table.parentElement?.clientWidth;
    if (!availableWidth || !this.columns.length || availableWidth === this.fittedWidth) return;
    this.fittedWidth = availableWidth;
    const remainingWidth = Math.max(0,availableWidth - minimumWidth * this.columns.length);
    const weights = this.baseWidths.map(width => width - minimumWidth);
    const totalWeight = weights.reduce((sum,width) => sum + width,0);
    this.columns.forEach((column,index) => {
      const share = totalWeight ? weights[index] / totalWeight : 1 / this.columns.length;
      column.style.width = `${minimumWidth + remainingWidth * share}px`;
    });
    this.setTableWidth();
    this.updateHandles();
    this.scheduleResize();
  }
  freezeWidths() {
    // Keep the other columns fixed instead of letting the table redistribute its width.
    this.observer?.disconnect(); this.observer = null;
    const headings = new Map([...this.table.querySelectorAll('th[data-heading]')].map(heading => [heading.dataset.heading,heading]));
    const widths = this.columns.map(column => headings.get(column.dataset.width)?.getBoundingClientRect().width || parseFloat(column.style.width));
    this.columns.forEach((column,index) => { column.style.width = `${widths[index]}px`; });
    this.setTableWidth();
  }
  setTableWidth() {
    this.table.style.minWidth = '0';
    this.table.style.width = `${this.columns.reduce((sum,column) => sum + parseFloat(column.style.width),0)}px`;
  }
  resize(column,width) {
    column.style.width = `${clampWidth(width)}px`; this.setTableWidth();
    this.updateHandles();
    this.scheduleResize();
  }
  updateHandles() {
    this.table.querySelectorAll('th [data-resize]').forEach(handle => {
      const column = this.columns.find(item => item.dataset.width === handle.dataset.resize);
      if (column) handle.setAttribute('aria-valuenow',String(Math.round(parseFloat(column.style.width))));
    });
  }
  scheduleResize() {
    if (!this.frame) this.frame = requestAnimationFrame(() => {
      this.frame = 0; if (this.table.isConnected) this.onResize();
    });
  }
  persist() {
    this.columns.forEach(column => this.saveWidth(column.dataset.width,parseFloat(column.style.width)));
  }
  start(event) {
    const handle = event.target.closest('[data-resize]');
    if (!handle || !this.table.contains(handle) || event.button !== 0 || event.isPrimary === false || this.finishDrag) return;
    const column = this.columns.find(item => item.dataset.width === handle.dataset.resize);
    if (!column) return;
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX; const pointerId = event.pointerId;
    this.freezeWidths();
    const width = parseFloat(column.style.width);
    this.table.classList.add('column-resizing'); document.body.classList.add('column-resizing');
    const move = item => {
      if (item.pointerId !== pointerId) return;
      item.preventDefault(); this.resize(column,width + item.clientX - startX);
    };
    const finish = item => {
      if (item?.pointerId !== undefined && item.pointerId !== pointerId) return;
      if (!this.finishDrag) return;
      this.finishDrag = null;
      document.removeEventListener('pointermove',move,true); document.removeEventListener('pointerup',finish,true); document.removeEventListener('pointercancel',finish,true);
      this.table.removeEventListener('lostpointercapture',finish); window.removeEventListener('blur',finish);
      if (this.table.hasPointerCapture(pointerId)) this.table.releasePointerCapture(pointerId);
      this.table.classList.remove('column-resizing'); document.body.classList.remove('column-resizing');
      this.persist();
      if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; if (this.table.isConnected) this.onResize(); }
    };
    this.finishDrag = finish;
    document.addEventListener('pointermove',move,{capture:true,passive:false}); document.addEventListener('pointerup',finish,true); document.addEventListener('pointercancel',finish,true);
    this.table.addEventListener('lostpointercapture',finish); window.addEventListener('blur',finish);
    try { this.table.setPointerCapture(pointerId); } catch { /* Document listeners also finish a drag if capture is unavailable. */ }
  }
  keyboard(event) {
    const handle = event.target.closest('th [data-resize]');
    if (!handle || !['ArrowLeft','ArrowRight'].includes(event.key) || this.finishDrag) return;
    const column = this.columns.find(item => item.dataset.width === handle.dataset.resize);
    if (!column) return;
    event.preventDefault(); event.stopPropagation();
    this.freezeWidths();
    this.resize(column,parseFloat(column.style.width) + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10));
    this.persist();
  }
  dispose() {
    this.observer?.disconnect(); this.observer = null;
    this.finishDrag?.();
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    this.table.removeEventListener('pointerdown',this.pointerDown); this.table.removeEventListener('keydown',this.keyDown); this.table.removeEventListener('click',this.click,true);
  }
}
