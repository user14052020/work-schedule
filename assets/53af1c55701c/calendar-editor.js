import {api, query} from './api-client.js';

/** Owns one calendar lease; sessionStorage is only a same-tab lease receipt. */
export class CalendarEditor {
  constructor({userId,brigadeId,period,onChange,onLost}) {
    this.resource = {brigadeId,period}; this.onChange = onChange; this.onLost = onLost;
    this.storageKey = `crm.calendar-edit.${userId}.${brigadeId}.${period}`;
    this.token = ''; this.lock = null; this.active = false; this.disposed = false; this.requesting = false;
    this.message = ''; this.known = false; this.generation = 0;
    this.timer = setInterval(() => this.poll(),40000);
  }
  receipt() { try { return sessionStorage.getItem(this.storageKey) || ''; } catch { return ''; } }
  remember(token) { try { token ? sessionStorage.setItem(this.storageKey,token) : sessionStorage.removeItem(this.storageKey); } catch { /* Server expiry still protects the lease. */ } }
  notify() { if (!this.disposed) this.onChange?.(); }
  async initialize() {
    // A refreshed page starts in reading mode. Releasing the old token before a
    // new acquisition also makes a delayed pagehide release harmless.
    await this.releaseReceipt();
    await this.refresh();
  }
  async releaseReceipt() {
    const token = this.token || this.receipt();
    if (!token) return;
    await api.post('/calendar-edit/release',{...this.resource,token},{activity:false});
    if (this.receipt() === token) this.remember('');
    if (this.token === token) this.token = '';
  }
  async refresh() {
    if (this.disposed) return;
    const generation = this.generation;
    const result = await api.get(`/calendar-edit?${query(this.resource)}`,{activity:false});
    if (this.disposed || generation !== this.generation) return;
    this.lock = result.lock || null; this.known = true;
    if (this.active && (!this.lock || !this.lock.mine)) this.lose('Право редактирования календаря потеряно. Несохраненные изменения остаются на этой странице.');
    this.notify();
    return this.lock;
  }
  async acquire() {
    if (this.disposed) throw Error('Страница графика закрыта.');
    if (this.active) return this.token;
    this.generation++;
    this.requesting = true; this.notify();
    try {
      await this.releaseReceipt();
      const lock = await api.post('/calendar-edit/acquire',this.resource);
      if (this.disposed) {
        await api.post('/calendar-edit/release',{...this.resource,token:lock.token},{keepalive:true,activity:false}).catch(() => {});
        throw Error('Страница графика закрыта.');
      }
      this.token = lock.token; this.lock = {...lock,mine:true}; this.active = true; this.known = true; this.message = '';
      this.remember(lock.token);
      return this.token;
    } catch(error) {
      this.message = error.message;
      await this.refresh().catch(() => {});
      throw error;
    } finally { this.requesting = false; this.notify(); }
  }
  lose(message) {
    const wasActive = this.active;
    this.active = false; this.message = message; this.notify();
    if (wasActive) this.onLost?.(message);
  }
  async poll() {
    if (this.disposed || this.requesting) return;
    const generation = this.generation;
    this.requesting = true;
    try {
      if (this.active) {
        const token = this.token;
        const lock = await api.post('/calendar-edit/renew',{...this.resource,token},{activity:false});
        if (!this.disposed && generation === this.generation && this.active && this.token === token) this.lock = {...lock,mine:true};
      } else await this.refresh();
    } catch(error) {
      if (this.disposed || generation !== this.generation) return;
      if (this.active) this.lose(`${error.message} Несохраненные изменения остаются на этой странице.`);
      else { this.message = error.message; this.known = false; }
    } finally { this.requesting = false; this.notify(); }
  }
  async release({keepalive = false,bestEffort = false} = {}) {
    this.generation++;
    const token = this.token || this.receipt();
    this.active = false;
    if (!token) { this.lock = null; this.notify(); return; }
    try {
      await api.post('/calendar-edit/release',{...this.resource,token},{keepalive,activity:false});
      if (this.receipt() === token) this.remember('');
      if (this.token === token) this.token = '';
      this.lock = null; this.message = ''; this.known = true;
    } catch(error) {
      this.message = 'Не удалось освободить календарь. Повторите завершение редактирования.';
      if (!bestEffort) throw error;
    } finally { this.notify(); }
  }
  async dispose({bestEffort = false,keepalive = false} = {}) {
    // A failed explicit release leaves this controller available for retry.
    // Session/page disposal must stop callbacks before the best-effort request.
    if (bestEffort) { this.disposed = true; clearInterval(this.timer); }
    await this.release({bestEffort,keepalive});
    clearInterval(this.timer);
    this.disposed = true;
  }
}
