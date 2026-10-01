import {api} from './api-client.js';
import {payrollFingerprint} from './schedule-model.js';

/** Coordinates aggregate writes and leases; UI state never substitutes for server authorization. */
export class ShiftEditor {
  constructor({onStatus, onSaved, onError, getEditToken, onLockLost, onConfirmationNeeded}) {
    this.onStatus = onStatus; this.onSaved = onSaved; this.onError = onError;
    this.getEditToken = getEditToken; this.onLockLost = onLockLost;
    this.onConfirmationNeeded = onConfirmationNeeded;
    this.entries = new Map(); this.disposed = false; this.suspended = false;
    this.renewTimer = setInterval(() => this.renew(), 40000);
  }
  entry(shift) {
    if (!this.entries.has(shift.id)) this.entries.set(shift.id, {shift, revision:0, savedRevision:0, lock:null, promise:null, timer:null, saving:null});
    const entry = this.entries.get(shift.id); entry.shift = shift; return entry;
  }
  async acquire(shift) {
    const editToken = this.requireEditing();
    const entry = this.entry(shift);
    if (entry.lock) return entry.lock;
    if (!entry.promise) entry.promise = api.post(`/shifts/${encodeURIComponent(shift.id)}/lock`,{editToken}).then(lock => {
      if (this.disposed) {
        api.post(`/shifts/${encodeURIComponent(shift.id)}/lock/release`,{token:lock.token},{keepalive:true,activity:false}).catch(() => {});
        throw Error('Редактирование смены завершено.');
      }
      entry.lock = lock; this.onStatus('Редактирование смены закреплено за вами'); return lock;
    }).catch(error => { this.handleLeaseError(error); throw error; }).finally(() => entry.promise = null);
    return entry.promise;
  }
  changed(shift) {
    this.requireEditing();
    const entry = this.entry(shift); entry.revision++;
    if (entry.confirmationFingerprint !== payrollFingerprint(shift)) {
      entry.confirmation = null; entry.confirmationError = null; entry.confirmationFingerprint = null; entry.confirmationPrompted = false;
    }
    this.onStatus('Есть несохраненные изменения');
    clearTimeout(entry.timer); entry.timer = setTimeout(() => this.save(entry).catch(this.onError), 500);
  }
  async save(entry) {
    clearTimeout(entry.timer);
    if (entry.saving) return entry.saving;
    if (entry.savedRevision === entry.revision) return;
    entry.saving = (async () => {
      const lock = await this.acquire(entry.shift);
      while (entry.savedRevision !== entry.revision) {
        const revision = entry.revision;
        const snapshot = structuredClone(entry.shift);
        const editToken = this.requireEditing();
        const fingerprint = payrollFingerprint(snapshot);
        if (entry.confirmationError && entry.confirmationFingerprint === fingerprint && !entry.confirmation) throw entry.confirmationError;
        this.onStatus('Сохранение…');
        let response;
        try {
          const confirmation = entry.confirmation?.fingerprint === fingerprint ? {confirmLegacyPayrollRecalculation:true,legacyPayrollReason:entry.confirmation.reason} : {};
          response = await api.put(`/shifts/${encodeURIComponent(snapshot.id)}`, {shift:snapshot, expectedVersion:snapshot.version || 0, lockToken:lock.token,editToken,...confirmation});
        } catch(error) {
          if (error.code === 'legacy_payroll_confirmation') {
            if (payrollFingerprint(entry.shift) !== fingerprint) continue;
            entry.confirmationFingerprint = fingerprint; entry.confirmationError = error;
          }
          throw error;
        }
        const saved = response.shift || response;
        entry.shift.version = saved.version;
        entry.shift.calculated = saved.calculated;
        if (entry.revision === revision) entry.shift.rows.forEach(job => {
          const confirmed = saved.rows?.find(row => row.id === job.id);
          if (confirmed) job.resolvedPeople = confirmed.resolvedPeople;
        });
        entry.savedRevision = revision;
        entry.confirmation = null; entry.confirmationError = null; entry.confirmationFingerprint = null; entry.confirmationPrompted = false;
        this.onSaved(entry.shift, saved);
      }
      this.onStatus('Все изменения сохранены');
    })();
    try { await entry.saving; }
    catch (error) {
      if (['lock_expired','shift_locked','calendar_edit_required','calendar_edit_expired'].includes(error.code)) entry.lock = null;
      if (error.code === 'legacy_payroll_confirmation' && !entry.confirmationPrompted) {
        entry.confirmationPrompted = true; this.onConfirmationNeeded?.(entry,error);
      }
      this.handleLeaseError(error);
      this.onStatus('Изменения не сохранены — повторите сохранение или обновите график', true);
      throw error;
    } finally { entry.saving = null; }
  }
  get dirty() { return [...this.entries.values()].some(entry => entry.savedRevision !== entry.revision); }
  get drafts() { return [...this.entries.values()].filter(entry => entry.savedRevision !== entry.revision).map(entry => entry.shift); }
  async confirmLegacy(id, fingerprint, reason) {
    this.requireEditing();
    const entry = this.entries.get(id);
    if (!entry || payrollFingerprint(entry.shift) !== fingerprint) throw Error('Данные расчета изменились. Повторите сохранение и подтвердите актуальные данные.');
    if (!reason.trim()) throw Error('Укажите основание перерасчета.');
    entry.confirmation = {fingerprint,reason:reason.trim()};
    await this.save(entry);
  }
  async settle() { await Promise.allSettled([...this.entries.values()].flatMap(entry => [entry.saving,entry.promise]).filter(Boolean)); }
  requireEditing() {
    const token = this.getEditToken?.();
    if (this.disposed || this.suspended || !token) throw Error('Сначала нажмите «Начать редактирование». Несохраненные изменения остаются на странице.');
    return token;
  }
  handleLeaseError(error) {
    if (error.status === 401 || ['calendar_locked','calendar_edit_required','calendar_edit_expired','closed_period'].includes(error.code)) {
      this.suspend(); this.onLockLost?.(error);
    }
  }
  suspend() {
    this.suspended = true;
    this.entries.forEach(entry => clearTimeout(entry.timer));
  }
  async flush() { await Promise.all([...this.entries.values()].map(entry => { entry.confirmationPrompted = false; return this.save(entry); })); }
  async renew() {
    if (this.disposed || this.suspended || !this.getEditToken?.()) return;
    for (const entry of this.entries.values()) {
      if (!entry.lock) continue;
      try { await api.post(`/shifts/${encodeURIComponent(entry.shift.id)}/lock/renew`, {token:entry.lock.token},{activity:false}); }
      catch (error) { entry.lock = null; this.handleLeaseError(error); this.onStatus('Блокировка истекла. Перед сохранением будет проверена версия смены.', true); }
    }
  }
  async dispose({discard = false,keepalive = false} = {}) {
    if (!discard) await this.flush();
    clearInterval(this.renewTimer); this.disposed = true;
    await Promise.all([...this.entries.values()].map(async entry => {
      clearTimeout(entry.timer);
      if (entry.lock) {
        try { await api.post(`/shifts/${encodeURIComponent(entry.shift.id)}/lock/release`, {token:entry.lock.token}, {keepalive,activity:false}); } catch { /* Calendar release also removes its owner's shift leases. */ }
      }
    }));
  }
}
