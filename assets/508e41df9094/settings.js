import {api,query} from './api-client.js';
import {state} from './state.js';
import {escape,option,toast,showError,loading,failure,openDialog,pageHeading} from './ui.js';
import {exportWorkbook} from './export.js';
import {ViewLifecycle} from './view-lifecycle.js';

export class SettingsView {
  constructor(container,{archive = false} = {}) { this.container = container; this.archive = archive; this.lifecycle = new ViewLifecycle(); }
  async mount() { if (this.archive) await this.loadYears(); else this.renderSettings(); }
  renderSettings() {
    if (this.lifecycle.disposed) return;
    this.container.innerHTML = pageHeading('Пояснения и помощь','Текст подсказок, который видят пользователи системы.') + `<form class="settings-form card"><label>Пояснение к составу смены<textarea name="shiftHelp" rows="5" required>${escape(state.settings.shiftHelp)}</textarea></label><label>Текст «Как пользоваться»<textarea name="usageHelp" rows="14" required>${escape(state.settings.usageHelp)}</textarea></label><button class="primary" type="submit">Сохранить пояснения</button></form>`;
    this.container.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button'); const payload = Object.fromEntries(new FormData(form)); button.disabled = true; form.inert = true;
      try { await api.put('/settings',payload); if (this.lifecycle.disposed) return; Object.assign(state.settings,payload); toast('Пояснения сохранены'); } catch(error) { if (!this.lifecycle.disposed) showError(error); } finally { button.disabled = false; form.inert = false; }
    };
  }
  async loadYears() {
    if (this.lifecycle.disposed) return;
    const request = this.lifecycle.begin();
    loading(this.container);
    try { const result = await api.get('/years',{signal:request.signal}); if (!request.current()) return; this.years = Array.isArray(result) ? result : result.items || result.years || []; state.years = this.years; this.renderYears(); }
    catch(error) { if (request.current() && error.name !== 'AbortError') failure(this.container,error,() => this.loadYears()); }
  }
  renderYears() {
    if (this.lifecycle.disposed) return;
    this.container.innerHTML = pageHeading('Архив по годам','Графики сохраняются по годам. Закрытые периоды доступны для просмотра и выгрузки.',state.admin ? '<button class="primary" data-new-year>＋ Создать новый год</button>' : '') + `<div class="year-cards">${this.years.map(item => { const year = item.year || item; const closed = item.closed || item.status === 'closed'; return `<article class="card year-card"><h2>${escape(year)}</h2><span class="badge ${closed ? '' : 'open'}">${closed ? 'Закрыт' : 'Открыт'}</span><div class="year-actions"><button class="button" data-open="${year}">Открыть графики</button><button class="button" data-export="${year}">↓ Все графики и справочники XLSX</button>${state.admin ? `<button class="text-button" data-${closed ? 'reopen' : 'close'}="${year}">${closed ? 'Открыть для изменений' : 'Закрыть год'}</button>` : ''}</div></article>`; }).join('')}</div>`;
    this.container.querySelector('[data-new-year]')?.addEventListener('click',() => this.createYear());
    this.container.querySelectorAll('[data-open]').forEach(button => button.onclick = () => { state.period = `${button.dataset.open}-01`; window.dispatchEvent(new CustomEvent('navigate',{detail:'schedule'})); });
    this.container.querySelectorAll('[data-export]').forEach(button => button.onclick = () => exportWorkbook({scope:'all',year:button.dataset.export}).catch(showError));
    this.container.querySelectorAll('[data-close]').forEach(button => button.onclick = () => this.closeYear(button.dataset.close));
    this.container.querySelectorAll('[data-reopen]').forEach(button => button.onclick = () => this.reopenYear(button.dataset.reopen));
  }
  createYear() {
    const next = Math.max(Number(state.currentDate.slice(0,4)),...this.years.map(item => Number(item.year || item)))+1;
    openDialog('Новый год','<p class="muted">Будет создан календарь нового года с действующими справочниками. Работы прошлых лет не копируются.</p><label>Год<input type="number" name="year" min="2000" max="2100" value="'+next+'" required></label>',async data => { await api.post('/years',{year:Number(data.get('year'))}); await this.loadYears(); if (!this.lifecycle.disposed) toast('Новый год создан'); });
  }
  closeYear(year) { openDialog('Закрыть год?',`<p>Графики ${year} года станут доступны только для чтения. Расчетные итоги будут зафиксированы.</p>`,async () => { await api.post(`/years/${year}/close`); await this.loadYears(); if (!this.lifecycle.disposed) toast('Год закрыт'); },{submit:'Закрыть год'}); }
  reopenYear(year) { openDialog('Открыть год для изменений',`<p>Графики ${year} года снова станут редактируемыми.</p><label>Основание<textarea name="reason" rows="3" required></textarea></label>`,async data => { await api.post(`/years/${year}/reopen`,{reason:data.get('reason')}); await this.loadYears(); if (!this.lifecycle.disposed) toast('Год открыт'); }); }
  async dispose() { this.lifecycle.dispose(); }
}
