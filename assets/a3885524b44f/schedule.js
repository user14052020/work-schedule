import {api, query} from './api-client.js';
import {state, monthNames, formatDate, number} from './state.js';
import {escape, option, options, toast, showError, loading, failure, openDialog, autoHeight, safeColor, safeLink} from './ui.js';
import {ShiftEditor} from './shift-editor.js';
import {CalendarEditor} from './calendar-editor.js';
import {exportWorkbook} from './export.js';
import {formatTimeInput, completeTime} from './time-input.js';
import {readClipboardGrid} from './clipboard-grid.js';
import {ViewLifecycle} from './view-lifecycle.js';
import {MAX_WORK_ROWS,emptyJob,extraTextFields,normalizeDay,prepareEditableRows,addWorkRows,removeWorkRow,hasWorkContent,RosterDraft} from './schedule-model.js';
import {renderDay,renderShift,renderJobCell,replaceDayRows} from './schedule-renderer.js';
import {ColumnResizer} from './column-resize.js';

const columns = [
  {key:'time',label:'Время',width:54}, {key:'lead',label:'Бригадир',width:90}, {key:'partner',label:'Осн. напарник',width:90},
  {key:'extra1',label:'Доп. напарник №1',width:90,hidden:true}, {key:'extra2',label:'Доп. напарник №2',width:90,hidden:true},
  {key:'invoice',label:'Счет',width:55,hidden:true}, {key:'pay',label:'ЗП за смену, ₽',width:80,hidden:true},
  {key:'adjustment',label:'Штрафы / премии, ₽',width:100,hidden:true}, {key:'total',label:'Часов за смену',width:56},
  {key:'objectId',label:'Артикул',width:62}, {key:'type',label:'Вид',width:60}, {key:'hours',label:'Часов на бригаду',width:60},
  {key:'object',label:'Объект',width:130}, {key:'phone',label:'Телефон работ',width:102}, {key:'objectNotes',label:'Примечания по объекту',width:130},
  {key:'task',label:'ТЗ на работы',width:150}, {key:'notes',label:'Примечания по работам / доп. ТЗ',width:130}, {key:'tech',label:'Техбаза',width:90}
];
const slotLabels = ['Бригадир', 'Осн. напарник', 'Доп. напарник №1', 'Доп. напарник №2', 'Доп. сотрудник'];
const graphModeIcon = (active = false) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${active ? 'M20 4l-7 7m0-6v6h6M4 20l7-7m-6 0h6v6' : 'M14 4h6v6M20 4l-7 7M4 14v6h6M4 20l7-7'}"/></svg>`;

export class ScheduleView {
  constructor(container, {personal = false, preview = false} = {}) {
    this.preview = Boolean(preview && state.admin);
    this.container = container; this.personal = personal || this.preview || !state.editable; this.closed = false; this.days = []; this.expanded = new Set([state.currentDate]);
    this.employeeId = this.personal ? this.preview
      ? this.previewEmployees.find(employee => String(employee.id) === String(state.user.employeeId))?.id || this.previewEmployees[0]?.id || ''
      : state.user.employeeId || '' : undefined;
    this.columns = this.personal ? columns.filter(column => !['extra1','extra2','invoice'].includes(column.key)).map(column => ['lead','partner'].includes(column.key) ? {...column,label:column.key === 'lead' ? 'Сотрудник' : 'Коллеги'} : column) : columns;
    this.visible = this.columns.filter(column => !column.hidden || state.preference(`column.${column.key}`));
    this.calendar = null; this.disposed = false; this.editingTransition = false; this.editNotice = '';
    this.disposing = false; this.lifecycle = new ViewLifecycle(); this.rosterDraft = new RosterDraft();
    this.editor = this.createEditor();
    this.onUnload = event => { if (this.editor.dirty) { event.preventDefault(); event.returnValue = ''; } };
    this.onPageHide = () => { this.columnResizer?.dispose(); this.editor.dispose({discard:true,keepalive:true}).catch(() => {}); this.calendar?.dispose({bestEffort:true,keepalive:true}).catch(() => {}); };
    this.onPageShow = event => { if (event.persisted) window.location.reload(); };
    window.addEventListener('beforeunload', this.onUnload);
    window.addEventListener('pagehide',this.onPageHide);
    window.addEventListener('pageshow',this.onPageShow);
  }
  get previewEmployees() {
    return (state.references.employees || []).filter(employee => ['Поля','field'].includes(employee.group))
      .sort((left,right) => Number(left.active === false) - Number(right.active === false));
  }
  async mount() { await this.load(); }
  async load() {
    if (this.disposed || this.disposing) return false;
    const request = this.lifecycle.begin();
    this.columnResizer?.dispose();
    loading(this.container);
    try {
      const data = await this.readSchedule({signal:request.signal});
      if (!request.current()) return false;
      this.acceptSchedule(data);
      this.render({scrollToToday:true});
      if (this.canEdit && !this.calendar) {
        this.calendar = new CalendarEditor({userId:state.user.id,brigadeId:state.brigadeId,period:state.period,onChange:() => this.updateEditingControls(),onLost:message => this.calendarLost(message)});
        try { await this.calendar.initialize(); }
        catch(error) { this.editNotice = error.message; this.updateEditingControls(); }
      }
      return request.current();
    } catch (error) { if (request.current() && error.name !== 'AbortError') { this.loadFailed = true; failure(this.container,error,() => this.load()); } return false; }
  }
  readSchedule(options) {
    if (this.personal && !this.employeeId) return Promise.resolve({days:[],closed:false});
    const route = this.personal ? `/personal?${query({period:state.period,employeeId:this.employeeId})}` : `/schedules?${query({period:state.period,brigadeId:state.brigadeId})}`;
    return api.get(route,options);
  }
  acceptSchedule(data) {
    this.loadFailed = false;
    this.days = (data.days || []).map(normalizeDay); this.closed = Boolean(data.closed);
    this.rosterDraft.accept(`${state.brigadeId}:${state.period}`,data.roster);
    if (this.calendar?.active && !this.closed) prepareEditableRows(this.days);
  }
  get roster() { return this.rosterDraft.values; }
  createEditor() {
    return new ShiftEditor({getEditToken:() => this.calendar?.active ? this.calendar.token : '',onLockLost:error => this.calendar?.lose(`${error.message} Несохраненные изменения остаются на странице.`),onConfirmationNeeded:entry => this.confirmLegacyPayroll(entry),onStatus:(message,error) => { if (!this.disposed) this.status(message,error); },onSaved:shift => { if (!this.disposed) this.updateTotals(shift); },onError:error => { if (!this.disposed && error.code !== 'legacy_payroll_confirmation') showError(error); }});
  }
  confirmLegacyPayroll(entry) {
    this.legacyPrompts ||= new Set();
    if (this.legacyPrompts.has(entry.shift.id)) return;
    this.legacyPrompts.add(entry.shift.id);
    const show = () => {
      if (this.disposed || !entry.confirmationError) { this.legacyPrompts.delete(entry.shift.id); return; }
      const dialog = document.querySelector('#dialog');
      if (dialog.open) { dialog.addEventListener('close',() => setTimeout(show,0),{once:true}); return; }
      const fingerprint = entry.confirmationFingerprint;
      const content = `<p>Для смены ${formatDate(entry.shift.date)} не сохранены исходные правила старого расчета. Изменение финансовых данных потребует перерасчета по текущим правилам.</p><p>Если отказаться, ваши правки останутся на странице без сохранения.</p>`;
      if (state.admin) openDialog('Подтвердить перерасчет?',content + '<label>Основание перерасчета<textarea name="reason" rows="3" required></textarea></label>',async data => {
        if (!this.editable || this.editor.entries.get(entry.shift.id) !== entry) throw Error('Режим редактирования завершен.');
        await this.editor.confirmLegacy(entry.shift.id,fingerprint,String(data.get('reason') || ''));
        this.renderDay(entry.shift); toast('Перерасчет подтвержден, изменения сохранены');
      },{submit:'Подтвердить и сохранить'});
      else openDialog('Требуется подтверждение администратора',content + '<p>Подтвердить такой перерасчет может только администратор.</p>');
      dialog.addEventListener('close',() => this.legacyPrompts.delete(entry.shift.id),{once:true});
    };
    // A failed navigation/save must first restore this view's normal interaction state.
    setTimeout(show,0);
  }
  async dispose({discard = false} = {}) {
    if (this.disposed) return;
    if (this.disposing && !discard) return this.disposePromise;
    this.disposing = true; this.lifecycle.dispose(); this.columnResizer?.dispose();
    if (discard) this.disposed = true;
    this.disposePromise = (async () => {
      try {
        await this.editor.dispose({discard,keepalive:discard});
        await this.calendar?.dispose({bestEffort:discard,keepalive:discard});
        this.disposed = true;
        window.removeEventListener('beforeunload',this.onUnload); window.removeEventListener('pagehide',this.onPageHide); window.removeEventListener('pageshow',this.onPageShow);
        document.body.classList.remove('graph-only');
      } catch(error) {
        if (!this.disposed) {
          this.lifecycle = new ViewLifecycle();
          if (this.editor.disposed) this.editor = this.createEditor();
        }
        throw error;
      } finally {
        this.disposing = false;
        if (!this.disposed && !this.loadFailed) this.render();
      }
    })();
    return this.disposePromise;
  }
  get canEdit() { return state.editable && !this.personal && !this.closed; }
  get editable() { return this.canEdit && this.calendar?.active && !this.editingTransition && !this.disposed && !this.disposing && !this.editor.disposed; }
  calendarLost(message) {
    this.editor.suspend(); this.editNotice = message;
    if (!this.disposed) { this.render(); this.status(message,true); }
  }
  updateEditingControls() {
    if (this.disposed) return;
    const button = this.container.querySelector('[data-edit-mode]');
    if (button) {
      button.textContent = this.calendar?.active ? 'Завершить редактирование' : 'Начать редактирование';
      button.disabled = Boolean(this.editingTransition || this.calendar?.requesting || !this.calendar?.known || (this.calendar?.lock && !this.calendar.lock.mine));
      button.classList.toggle('editing-active',Boolean(this.calendar?.active));
    }
    this.container.querySelectorAll('[data-month],[data-year],[data-brigade],[data-personal-employee],[data-open-brigade]').forEach(control => { control.disabled = this.editingTransition || (control.hasAttribute('data-personal-employee') && !this.previewEmployees.length); });
    const target = this.container.querySelector('[data-edit-status]');
    if (target) {
      const lock = this.calendar?.lock;
      target.textContent = this.editNotice || (this.calendar?.active ? 'Режим редактирования. Выбранная бригада и месяц закреплены за вами.' : lock ? `Календарь редактирует ${lock.owner}.` : this.calendar?.known ? 'Режим просмотра. Чтобы изменить график, начните редактирование.' : 'Получение состояния редактирования…');
      target.classList.toggle('edit-warning',Boolean(this.editNotice));
    }
  }
  async startEditing() {
    if (!this.canEdit || !this.calendar || this.editingTransition || this.calendar.active) return;
    this.editingTransition = true; this.updateEditingControls();
    try {
      await this.editor.settle();
      const drafts = this.editor.drafts;
      await this.calendar.acquire();
      const data = await this.readSchedule();
      if (this.disposed || !this.calendar.active) throw Error('Режим редактирования уже завершен.');
      if (data.closed) throw Error('Период закрыт. Редактирование недоступно.');
      const versions = new Map((data.days || []).map(day => [day.id,day.version || 0]));
      if (drafts.some(day => versions.get(day.id) !== (day.version || 0))) throw Error('На сервере изменились смены с вашими несохраненными правками. Правки остались на экране: скопируйте нужный текст перед обновлением графика.');
      await this.resetEditor({discard:true});
      this.acceptSchedule(data);
      drafts.forEach(draft => { const index = this.days.findIndex(day => day.id === draft.id); if (index >= 0) { this.days[index] = draft; this.editor.changed(draft); } });
      this.editNotice = '';
    } catch(error) {
      await this.calendar?.release({bestEffort:true}); this.editor.suspend(); this.editNotice = error.message;
      if (!this.disposed) showError(error);
    } finally { this.editingTransition = false; if (!this.disposed && !this.loadFailed) this.render(); }
  }
  async finishEditing() {
    if (this.editingTransition) return;
    this.editingTransition = true; this.render();
    try { await this.editor.flush(); await this.resetEditor(); await this.calendar?.release(); this.editNotice = ''; }
    catch(error) { this.editNotice = error.message; if (!this.disposed) showError(error); }
    finally { this.editingTransition = false; if (!this.disposed && !this.loadFailed) this.render(); }
  }
  async leaveCalendar() {
    await this.editor.dispose();
    await this.calendar?.dispose();
    if (this.disposed) return;
    this.calendar = null; this.editor = this.createEditor(); this.editNotice = '';
  }
  async reloadSchedule({discard = false} = {}) {
    if (this.editingTransition || this.disposed || this.disposing) return;
    this.editingTransition = true; this.updateEditingControls();
    try {
      await this.resetEditor({discard});
      if (this.disposed) return;
      if (this.calendar && !this.calendar.active) { await this.calendar.dispose(); this.calendar = null; }
      this.editNotice = '';
      await this.load();
    } finally { this.editingTransition = false; if (!this.disposed && !this.loadFailed) this.render(); }
  }
  status(message,error = false) {
    const target = this.container.querySelector('[data-save-status]');
    if (target) { target.textContent = message; target.classList.toggle('unsaved',error); }
    const connection = document.querySelector('#connection-status'); if (connection) connection.textContent = message;
  }
  render({scrollToToday = false} = {}) {
    if (this.disposed || this.disposing) return;
    this.columnResizer?.dispose();
    const previousScroll = this.container.querySelector('.table-scroll');
    const scrollPosition = {top:previousScroll?.scrollTop || 0,left:previousScroll?.scrollLeft || 0};
    const years = [...new Set([...state.years.map(row => Number(row.year || row)), Number(state.period.slice(0,4)), Number(state.currentDate.slice(0,4))])].sort((a,b) => b-a);
    const employeeOptions = selectedId => options(state.references.employees?.filter(row => row.active !== false && ['Поля','field'].includes(row.group)),selectedId,{label:'shortName'});
    const personalEmployee = this.preview
      ? `<div class="personal-employee"><label class="overline" for="personal-employee">СОТРУДНИК</label><select id="personal-employee" data-personal-employee ${this.previewEmployees.length ? '' : 'disabled'}>${this.previewEmployees.length ? this.previewEmployees.map(employee => option(employee.id,`${employee.shortName || employee.name || employee.id}${employee.active === false ? ' (неактивен)' : ''}`,this.employeeId)).join('') : '<option value="">Нет сотрудников</option>'}</select></div>`
      : `<div class="personal-employee"><span class="overline">СОТРУДНИК</span><strong>${escape(state.user.name)}</strong></div>`;
    const emptyPersonalMessage = !this.employeeId ? this.preview ? 'В справочнике нет сотрудников со статусом «Поля».' : 'У пользователя не указан сотрудник.' : 'В выбранном месяце работы не назначены.';
    this.container.innerHTML = `
      <div class="schedule-top"><div class="page-heading"><div><h1>${this.preview ? 'График сотрудника' : this.personal ? 'Личный график' : 'График бригады'} ${this.closed ? '<span class="badge">Период закрыт</span>' : ''}</h1></div>${state.editable && !this.personal ? `<div class="heading-actions">${this.canEdit ? '<button class="primary calendar-edit-button" data-edit-mode disabled>Начать редактирование</button>' : ''}<button class="button" data-export>↓ Экспорт XLSX</button><button class="button" data-search>⌕ Поиск</button></div>` : ''}</div>
      ${this.canEdit ? '<div class="calendar-edit-status" data-edit-status role="status"></div>' : ''}
      ${this.personal ? '' : '<div class="brigade-summary" data-summary aria-label="Составы бригад за последние три дня"></div>'}
      <section class="overview ${this.personal ? 'personal-overview' : ''}"><div class="period"><span class="overline">ПЕРИОД</span><div class="period-selectors"><select data-month aria-label="Месяц">${monthNames.map((label,index) => option(String(index+1).padStart(2,'0'),label,state.period.slice(5))).join('')}</select><select data-year aria-label="Год">${years.map(year => option(year,year,state.period.slice(0,4))).join('')}</select></div></div>
      ${this.personal ? personalEmployee : `<div class="brigade"><label class="overline">БРИГАДА</label><select data-brigade aria-label="Бригада">${options(state.references.brigades,state.brigadeId,{empty:null,label:'code'})}</select></div>${[0,1,2,3].map(slot => `<div class="person ${slot === 0 ? 'lead' : slot === 1 ? 'partner' : 'extra'}"><label class="overline">${escape(slotLabels[slot])}</label><select data-roster="${slot}" ${this.editable ? '' : 'disabled'}>${slot === 0 ? this.rosterOptions(slot,this.roster[slot]) : employeeOptions(this.roster[slot])}</select>${slot === 3 ? `<select data-roster="4" aria-label="Дополнительный сотрудник" ${this.editable ? '' : 'disabled'}>${employeeOptions(this.roster[4])}</select>` : ''}</div>`).join('')}`}
      <div class="overview-total"><span class="overline">ЧАСОВ ЗА МЕСЯЦ</span><strong data-month-hours>—</strong></div>${this.personal ? '<div class="overview-total personal-pay-total"><span class="overline">ЗП ЗА МЕСЯЦ</span><strong data-month-pay>—</strong><small data-month-pay-note></small></div>' : ''}${this.editable ? '<div class="overview-action"><button class="primary" data-apply-roster title="Заполнить состав только в пустых сменах выбранного месяца">Заполнить</button></div>' : ''}</section>
      </div>
      <section class="sheet-panel"><div class="sheet-toolbar"><strong>${this.personal ? 'Мои работы' : escape(state.brigadeName(state.brigadeId)) + ' · Календарь работ'}</strong><div class="sheet-controls"><button class="text-button" data-expand>Развернуть дни</button><button class="text-button" data-collapse>Свернуть дни</button>${this.editable ? '<button class="text-button" data-save>Сохранить</button>' : ''}<button class="text-button" data-reload>Обновить</button><button class="button graph-mode-button" type="button" data-fullscreen aria-label="Только график" title="Только график">${graphModeIcon()}</button></div></div>
      <div class="column-options"><span>Столбцы:</span>${this.columns.filter(column => column.hidden).map(column => `<label><input type="checkbox" data-column="${column.key}" ${this.visible.some(item => item.key === column.key) ? 'checked' : ''}>${escape(column.label)}</label>`).join('')}</div>
      ${this.personal ? '' : `<div class="sheet-hint">${escape(state.settings.shiftHelp || 'Состав смены можно изменить. В работу подставляются сотрудники с рабочими статусами.')} ${this.closed ? '<strong>Редактирование закрытого периода недоступно.</strong>' : ''}</div>`}
      <div class="table-scroll"><table class="schedule-table ${this.personal ? 'personal-schedule-table' : ''}"><colgroup>${this.visible.map(column => `<col data-width="${column.key}" style="width:${this.columnWidth(column)}px">`).join('')}</colgroup><thead><tr>${this.visible.map(column => `<th class="${column.key} ${this.personalCellClass(null,column.key)}" data-heading="${column.key}" aria-label="${escape(column.accessibleLabel || column.label)}">${escape(column.label)}<span class="column-resizer" data-resize="${column.key}" title="Изменить ширину столбца" tabindex="0" role="separator" aria-label="Ширина столбца ${escape(column.accessibleLabel || column.label)}" aria-orientation="vertical" aria-valuemin="45" aria-valuemax="800" aria-valuenow="${this.columnWidth(column)}"></span></th>`).join('')}</tr></thead><tbody>${this.days.map(day => this.dayHtml(day)).join('') || (this.personal ? `<tr class="empty-day"><td colspan="${this.visible.length}">${escape(emptyPersonalMessage)}</td></tr>` : '')}</tbody></table></div>
      ${this.personal ? '' : `<div class="sheet-footer"><span data-save-status>${this.editor.dirty ? 'Есть несохраненные изменения' : this.editable ? 'Все изменения сохранены' : 'Просмотр графика'}</span><span>Tab — следующая ячейка · вставка диапазона из Excel</span></div>`}</section><div class="type-totals" data-type-totals></div>`;
    this.bind(); this.updateTotals(); this.updateEditingControls(); autoHeight(this.container); if (!this.personal) this.loadSummary();
    const scroll = this.container.querySelector('.table-scroll');
    scroll.scrollLeft = scrollPosition.left;
    if (scrollToToday) this.scrollToCurrentDay();
    else scroll.scrollTop = scrollPosition.top;
  }
  renderDay(day) {
    if (this.disposed || this.disposing) return;
    const table = this.container.querySelector('.schedule-table');
    if (!table) return;
    autoHeight(replaceDayRows(table,day,this.dayHtml(day)));
    this.updateTotals();
  }
  toggleDay(date) {
    const days = this.days.filter(item => item.date === date); if (!days.length) return;
    this.expanded.has(date) ? this.expanded.delete(date) : this.expanded.add(date);
    days.forEach(day => this.renderDay(day));
  }
  expandDays(expanded) {
    if (!this.days.length) return;
    this.expanded = new Set(expanded ? this.days.map(day => day.date) : []);
    const body = this.container.querySelector('.schedule-table tbody');
    if (!body) return;
    body.innerHTML = this.days.map(day => this.dayHtml(day)).join('');
    autoHeight(body);
  }
  scrollToCurrentDay() {
    const scroll = this.container.querySelector('.table-scroll');
    const today = scroll?.querySelector('.date-row.today');
    if (!today) return;
    const headingHeight = scroll.querySelector('thead')?.getBoundingClientRect().height || 0;
    scroll.scrollTop += today.getBoundingClientRect().top - scroll.getBoundingClientRect().top - scroll.clientTop - headingHeight;
  }
  columnWidth(column) { return Math.max(45,Math.min(800,Number(state.preference(`width.${column.key}`)) || column.width)); }
  dayHtml(day) { return renderDay(this,day); }
  shiftHtml(day) { return renderShift(this,day); }
  rosterOptions(slot,selectedId) {
    const positions = new Set((state.references.positions || []).filter(position => ['бригадир', '1/2 бригадир'].includes(String(position.code || position.label || '').trim().toLowerCase())).map(position => String(position.id)));
    const employees = (state.references.employees || []).filter(employee => {
      const available = employee.active !== false && ['Поля','field'].includes(employee.group);
      return slot === 0 ? available && positions.has(String(employee.positionId)) : available || employee.id === selectedId;
    });
    const choices = options(employees,selectedId,{label:'shortName'});
    // Keep historical assignments visible without offering them for a new selection.
    return slot === 0 && selectedId && !employees.some(employee => String(employee.id) === String(selectedId))
      ? `${choices}<option value="${escape(selectedId)}" selected disabled hidden>${escape(state.employeeName(selectedId))}</option>`
      : choices;
  }
  personalRoleClass(day) {
    // The shift assignment determines the color for all of its work rows.
    return day?.ownRosterSlot === 0 ? 'personal-lead' : day?.ownRosterSlot === 1 ? 'personal-partner' : 'personal-extra';
  }
  personalCellClass(day, key, row = null) {
    if (!this.personal || !['lead','partner'].includes(key)) return '';
    const color = key === 'lead' ? this.personalRoleClass(day)
      : !day || row || !day.shiftColleagueId ? 'personal-extra' : day.ownRosterSlot === 0 ? 'personal-partner' : 'personal-lead';
    return `personal-person ${color}`;
  }
  rosterCell(day,slot) {
    if (this.personal) {
      const ownSlot = day.ownRosterSlot;
      const name = slot === 0 ? state.employeeName(this.employeeId) : day.shiftColleagueName || state.employeeName(day.shiftColleagueId);
      const status = slot === 0 ? (Number.isInteger(ownSlot) ? day.statuses[ownSlot] : '') : day.shiftColleagueStatus;
      return `<div class="personal-roster-name">${escape(name)}</div><div class="personal-roster-status">${escape(status || '')}</div>`;
    }
    if (!this.editable) return `<div class="read-value">${escape(day.rosterNames?.[slot] || state.employeeName(day.roster[slot]))} <small>${escape(day.statuses[slot] || '')}</small></div>`;
    const status = (state.references.statuses || []).find(row => row.code === day.statuses[slot]);
    return `<select class="cell-input roster-cell" data-shift="${escape(day.id)}" data-slot="${slot}" data-shift-field="roster" aria-label="${slotLabels[slot]}">${this.rosterOptions(slot,day.roster[slot])}</select><select class="status-select" style="background:${safeColor(status?.color)}" data-shift="${escape(day.id)}" data-slot="${slot}" data-shift-field="statuses" aria-label="Статус сотрудника">${options(state.references.statuses,day.statuses[slot],{value:'code',label:'code'})}</select>`;
  }
  shiftInput(day,field,value,type,{disabled = !this.editable, placeholder = '', className = '', title = ''} = {}) {
    const attrs = `class="cell-input ${className}" data-shift="${escape(day.id)}" data-shift-field="${field}" ${disabled ? 'readonly' : ''} placeholder="${escape(placeholder)}" aria-label="${escape(field)}" title="${escape(title)}"`;
    // HTML consumes the first newline after <textarea>; the prefix preserves any leading newline in the value.
    return type === 'textarea' ? `<textarea ${attrs} rows="1">\n${escape(value)}</textarea>` : `<input ${attrs} type="${type}" ${type === 'number' ? 'step="any"' : ''} value="${escape(value)}">`;
  }
  jobCell(day,row,column,index) { return renderJobCell(this,day,row,column,index); }
  participantCell(day,row,slot) {
    if (this.personal) {
      if (slot === 0) return `<div class="read-value">${escape(state.employeeName(this.employeeId))}</div>`;
      const seen = new Set([this.employeeId]);
      const names = (row.resolvedPeople || row.people || []).flatMap((id,index) => {
        if (!id || seen.has(id)) return [];
        seen.add(id);
        return [row.peopleNames?.[index] || state.employeeName(id)];
      });
      return `<div class="read-value">${names.length ? names.map(escape).join('<br>') : '—'}</div>`;
    }
    const value = row.people?.[slot]; const inherited = value === null || value === undefined;
    const display = this.personal || !this.editable && !this.editor.dirty ? row.resolvedPeople?.[slot] || '' : (inherited ? day.roster[slot] : value);
    if (!this.editable) return `<div class="read-value">${escape(display ? row.peopleNames?.[slot] || state.employeeName(display) : '—')}</div>`;
    return `<select class="cell-input participant" data-person="${slot}" aria-label="Участие: ${slotLabels[slot]}">${this.rosterOptions(slot,display)}</select>`;
  }
  techCell(row,attrs) {
    const renderLink = (field,value) => `<div class="tech-link-row"><input ${attrs.replace('data-field="tech"',`data-field="${field}"`)} value="${escape(value)}" placeholder="https://">${safeLink(value) ? `<a href="${escape(safeLink(value))}" target="_blank" rel="noopener noreferrer" aria-label="Открыть ссылку">↗</a>` : ''}</div>`;
    return renderLink('tech',row.tech) + (row.tech2 ? renderLink('tech2',row.tech2) : this.editable ? '<button type="button" class="text-button small" data-second-link>＋ ссылка</button>' : '');
  }
  textCell(row,field,attrs) {
    const extra = extraTextFields[field];
    return `<textarea ${attrs} rows="1">\n${escape(row[field])}</textarea>`
      + (row[extra.field] ? this.extraTextInput(extra,row[extra.field]) : this.editable ? `<button type="button" class="text-button small" data-extra-text="${field}" aria-label="${escape(extra.label)}">＋ строка</button>` : '');
  }
  extraTextInput(extra,value) {
    return `<textarea class="cell-input ${extra.className}" data-field="${extra.field}" rows="1" aria-label="${escape(extra.label)}" ${this.editable ? '' : 'readonly'}>\n${escape(value)}</textarea>`;
  }
  bind() {
    const root = this.container;
    root.querySelector('[data-edit-mode]')?.addEventListener('click',() => this.calendar?.active ? this.finishEditing() : this.startEditing());
    root.querySelector('[data-month]').onchange = event => this.changePeriod(`${state.period.slice(0,4)}-${event.target.value}`);
    root.querySelector('[data-year]').onchange = event => this.changePeriod(`${event.target.value}-${state.period.slice(5)}`);
    root.querySelector('[data-brigade]')?.addEventListener('change',event => this.changeBrigade(event.target.value));
    root.querySelector('[data-personal-employee]')?.addEventListener('change',event => {
      const employee = this.preview && state.admin ? this.previewEmployees.find(item => String(item.id) === event.target.value) : null;
      if (!employee || this.editingTransition) return;
      this.employeeId = employee.id; this.load();
    });
    root.querySelector('[data-apply-roster]')?.addEventListener('click',() => this.applyRoster());
    root.querySelectorAll('[data-roster]').forEach(input => input.onchange = () => { if (this.editable) this.rosterDraft.set(Number(input.dataset.roster),input.value); });
    root.querySelector('[data-expand]').onclick = () => this.expandDays(true);
    root.querySelector('[data-collapse]').onclick = () => this.expandDays(false);
    root.querySelector('[data-save]')?.addEventListener('click',() => this.editor.flush().then(() => toast('Изменения сохранены')).catch(showError));
    root.querySelector('[data-reload]').onclick = async () => {
      try { await this.reloadSchedule(); }
      catch(error) { if (!this.disposed) openDialog('Загрузить график с сервера?',`<p class="error">${escape(error.message)}</p><p>Несохраненные изменения этой вкладки будут отменены. Сохраненные на сервере данные останутся в графике.</p>`,async () => { await this.reloadSchedule({discard:true}); },{submit:'Отменить изменения и загрузить'}); }
    };
    root.querySelector('[data-fullscreen]').onclick = () => this.setGraphOnly(!document.body.classList.contains('graph-only'));
    this.updateGraphMode();
    root.querySelector('[data-export]')?.addEventListener('click',() => exportWorkbook({scope:'month',year:state.period.slice(0,4),period:state.period}).catch(showError));
    root.querySelector('[data-search]')?.addEventListener('click',() => window.dispatchEvent(new CustomEvent('navigate',{detail:'search'})));
    root.querySelectorAll('[data-column]').forEach(input => input.onchange = () => { state.preference(`column.${input.dataset.column}`,input.checked); this.visible = this.columns.filter(column => !column.hidden || state.preference(`column.${column.key}`)); this.render(); });
    const table = root.querySelector('.schedule-table');
    this.columnResizer = new ColumnResizer(table,{savedWidth:key => state.preference(`width.${key}`),saveWidth:(key,width) => state.preference(`width.${key}`,width),onResize:() => { if (!this.disposed && !this.disposing) autoHeight(table); }});
    table.addEventListener('focusin',event => {
      if (!this.editable || !event.target.matches('input,textarea,select') || event.target.readOnly || event.target.disabled) return;
      const id = event.target.dataset.shift || event.target.closest('[data-shift]')?.dataset.shift;
      const day = this.days.find(item => item.id === id);
      if (day) this.editor.acquire(day).catch(error => { showError(error); event.target.blur(); });
    });
    table.oninput = event => {
      if (event.target.matches('textarea')) autoHeight(event.target);
      if (event.target.matches('input,textarea')) this.editCell(event);
    };
    table.onchange = event => this.editCell(event);
    table.addEventListener('focusout',event => {
      const input = event.target;
      if (!input.matches('[data-field="time"][aria-invalid="true"]')) return;
      const row = input.closest('[data-job]');
      const day = this.days.find(item => item.id === row?.dataset.shift);
      input.value = day?.rows.find(item => item.id === row.dataset.job)?.time || '';
      input.setCustomValidity(''); input.removeAttribute('aria-invalid');
      this.status(this.editor.dirty ? 'Есть несохраненные изменения' : 'Все изменения сохранены');
      toast('Введите время полностью в формате ЧЧ:ММ, от 00:00 до 23:59. Значение времени не изменено.',true);
    });
    table.onpaste = event => this.pasteCells(event);
    table.onclick = event => {
      const toggle = event.target.closest('[data-toggle]');
      if (toggle) { this.toggleDay(toggle.dataset.toggle); return; }
      const add = event.target.closest('[data-add]');
      if (add && this.editable) { void this.addJobs(add.dataset.add); return; }
      const remove = event.target.closest('[data-remove-job]');
      if (remove && this.editable) { this.removeJob(remove.closest('[data-shift]').dataset.shift,remove.dataset.removeJob); return; }
      const allocation = event.target.closest('[data-allocate]');
      if (allocation && this.editable) { this.allocate(this.days.find(day => day.id === allocation.dataset.allocate)); return; }
      const textButton = event.target.closest('[data-extra-text]');
      if (textButton && this.editable) {
        const extra = extraTextFields[textButton.dataset.extraText];
        const row = textButton.closest('[data-job]');
        const day = this.days.find(item => item.id === row.dataset.shift);
        const job = day.rows.find(item => item.id === row.dataset.job);
        textButton.outerHTML = this.extraTextInput(extra,job[extra.field]);
        autoHeight(row); row.querySelector(`[data-field="${extra.field}"]`).focus();
        return;
      }
      const button = event.target.closest('[data-second-link]');
      if (button && this.editable) { const row = button.closest('[data-job]'); const day = this.days.find(item => item.id === row.dataset.shift); const job = day.rows.find(item => item.id === row.dataset.job); button.outerHTML = `<div class="tech-link-row"><input class="cell-input" data-field="tech2" value="${escape(job.tech2)}" placeholder="https://" aria-label="Вторая ссылка техбазы"></div>`; row.querySelector('[data-field="tech2"]').focus(); }
    };
  }
  async resetEditor(options) { await this.editor.dispose(options); if (!this.disposed) this.editor = this.createEditor(); }
  updateGraphMode() {
    const active = document.body.classList.contains('graph-only');
    const button = this.container.querySelector('[data-fullscreen]');
    if (!button) return;
    const label = active ? 'Вернуться к меню' : 'Только график';
    button.innerHTML = graphModeIcon(active); button.title = label;
    button.setAttribute('aria-label',label); button.setAttribute('aria-pressed',String(active));
  }
  setGraphOnly(active) {
    document.body.classList.toggle('graph-only',active); this.updateGraphMode();
    if (active) this.scrollToCurrentDay();
    this.container.querySelector('[data-fullscreen]')?.focus({preventScroll:true});
    window.scrollTo({top:0});
  }
  async changeBrigade(brigadeId, {graphOnly = false} = {}) {
    if (this.switchingBrigade || this.editingTransition || this.disposed) return;
    if (brigadeId === state.brigadeId) { if (graphOnly) this.setGraphOnly(true); return; }
    this.switchingBrigade = true;
    this.editingTransition = true; this.render();
    this.container.querySelectorAll('[data-brigade],[data-open-brigade]').forEach(button => button.disabled = true);
    try {
      if (brigadeId !== state.brigadeId) {
        await this.leaveCalendar(); if (this.disposed) return; state.brigadeId = brigadeId;
        if (!await this.load()) return;
      }
      if (graphOnly) this.setGraphOnly(true);
    } catch(error) { if (!this.disposed) showError(error); }
    finally {
      this.switchingBrigade = false;
      this.editingTransition = false;
      if (!this.disposed && !this.loadFailed) this.render();
    }
  }
  async changePeriod(period) {
    if (this.editingTransition || this.disposed || period === state.period) return;
    this.editingTransition = true; this.render();
    try { await this.leaveCalendar(); if (this.disposed) return; state.period = period; this.expanded = new Set([state.currentDate]); await this.load(); }
    catch(error) { if (!this.disposed) showError(error); }
    finally { this.editingTransition = false; if (!this.disposed && !this.loadFailed) this.render(); }
  }
  async editCell(event) {
    const input = event.target; const row = input.closest('[data-job]');
    const id = input.dataset.shift || input.closest('[data-shift]')?.dataset.shift;
    const day = this.days.find(item => item.id === id); if (!day || !this.editable || input.readOnly || input.disabled) return;
    try {
      this.editor.requireEditing();
      const field = input.dataset.shiftField;
      if (field) {
        if (['roster','statuses'].includes(field)) {
          const slot = Number(input.dataset.slot); day[field][slot] = input.value;
          if (field === 'roster') day.statuses[slot] = input.value ? 'РД' : '';
          const statusInput = input.closest('td')?.querySelector(`.status-select[data-slot="${slot}"]`);
          if (statusInput) statusInput.value = day.statuses[slot];
          this.updateParticipantInputs(day);
        }
        else if (['pay','adjustment','hoursOverride'].includes(field)) { day[field] = this.numeric(input.value); if (field === 'pay') day.overrideReason = 'Корректировка администратором'; }
        else day[field] = input.value;
      } else if (row) {
        const job = day.rows.find(item => item.id === row.dataset.job);
        if (input.dataset.person !== undefined) {
          const slot = Number(input.dataset.person); job.people ||= [null,null,null,null,null];
          job.people[slot] = input.value && input.value === day.roster[slot] ? null : input.value;
        }
        else if (input.dataset.field) {
          if (input.dataset.field === 'time') {
            const formatted = formatTimeInput(input.value,input.selectionStart,event.inputType?.startsWith('delete'));
            input.value = formatted.value; input.setSelectionRange(formatted.caret,formatted.caret);
            const value = completeTime(input.value);
            input.setCustomValidity(value === null ? 'Введите время полностью: ЧЧ:ММ, от 00:00 до 23:59.' : '');
            if (value === null) { input.setAttribute('aria-invalid','true'); this.status('Завершите ввод времени: ЧЧ:ММ',true); return; }
            input.removeAttribute('aria-invalid');
            if (job.time === value) { this.status(this.editor.dirty ? 'Есть несохраненные изменения' : 'Все изменения сохранены'); return; }
            input.value = value;
          }
          job[input.dataset.field] = input.dataset.field === 'hours' ? this.numeric(input.value) : input.value;
          const workType = state.references.workTypes?.find(item => item.code === job.type);
          const isTravel = workType?.metadata?.isTravel ?? (job.type === 'ПРЗД');
          if (input.dataset.field === 'type' && input.value && !isTravel && !job.invoice) job.invoice = state.references.invoiceStates?.find(item => item.code === 'НЕТ')?.code || '';
        }
      }
      this.editor.changed(day);
      if (input.dataset.shiftField === 'adjustment') { input.classList.toggle('negative',Number(input.value)<0); input.classList.toggle('positive',Number(input.value)>0); }
    } catch(error) { showError(error); this.render(); }
  }
  numeric(value) { if (!String(value).trim()) return null; const parsed = Number(String(value).replace(',','.')); if (!Number.isFinite(parsed)) throw Error('Введите число. Для дробной части можно использовать запятую.'); return parsed; }
  async pasteCells(event) {
    const input = event.target; if (!input.matches('textarea[data-field],input[data-field]') || !this.editable) return;
    let cells;
    try {
      cells = readClipboardGrid({text:event.clipboardData.getData('text/plain'),html:event.clipboardData.getData('text/html')},{splitPlainRows:input.dataset.field === 'time'});
    } catch(error) { event.preventDefault(); showError(error); return; }
    if (!cells) return;
    event.preventDefault();
    const rowElement = input.closest('[data-job]'); const day = this.days.find(item => item.id === rowElement.dataset.shift);
    const editor = this.editor;
    const keys = ['tech2','objectExtra','notesExtra'].includes(input.dataset.field) ? [input.dataset.field] : this.visible.map(column => column.key);
    const startColumn = keys.indexOf(input.dataset.field);
    try {
      await editor.acquire(day);
      if (editor !== this.editor || editor.disposed || !this.editable || !rowElement.isConnected) return;
      const draft = structuredClone(day.rows); const startRow = draft.findIndex(row => row.id === rowElement.dataset.job);
      if (startRow < 0 || startColumn < 0) throw Error('Выберите ячейку работы для вставки.');
      if (startRow + cells.length > MAX_WORK_ROWS) throw Error(`В одной смене можно разместить не более ${MAX_WORK_ROWS} строки работ.`);
      for (let rowOffset = 0; rowOffset < cells.length; rowOffset++) {
        while (draft.length <= startRow + rowOffset) draft.push(emptyJob());
        for (let columnOffset = 0; columnOffset < cells[rowOffset].length; columnOffset++) {
          const key = keys[startColumn + columnOffset];
          if (!key || ['lead','partner','extra1','extra2','pay','adjustment','total'].includes(key)) throw Error('Вставляйте диапазон в столбцы работ, без расчетных столбцов и состава.');
          const value = cells[rowOffset][columnOffset];
          if (['type','invoice'].includes(key) && value && !(state.references[key === 'type' ? 'workTypes' : 'invoiceStates'] || []).some(item => item.code === value)) throw Error(`Значение «${value}» отсутствует в справочнике.`);
          if (['tech','tech2'].includes(key) && value && !safeLink(value)) throw Error('Техбаза должна содержать ссылку http:// или https://.');
          const time = key === 'time' ? completeTime(value) : null;
          if (key === 'time' && time === null) throw Error('Время должно быть указано полностью: ЧЧ:ММ, от 00:00 до 23:59.');
          draft[startRow + rowOffset][key] = key === 'hours' ? this.numeric(value) : key === 'time' ? time : value;
        }
      }
      day.rows = draft; this.editor.changed(day); this.renderDay(day);
    } catch(error) { showError(error); }
  }
  async applyRoster() {
    if (!this.editable || this.fillingRoster) return;
    const {brigadeId,period} = state;
    const button = this.container.querySelector('[data-apply-roster]');
    const roster = [...this.rosterDraft.values];
    this.fillingRoster = true; this.editingTransition = true; button.disabled = true; this.render();
    try {
      await this.editor.flush(); await this.resetEditor();
      if (this.disposed || !this.calendar?.active) throw Error('Сначала начните редактирование календаря.');
      const result = await api.post('/roster/apply',{brigadeId,period,roster,editToken:this.calendar.token});
      this.rosterDraft.commit(roster);
      await this.load(); if (!this.disposed) toast(`Заполнено смен: ${result.updated ?? 0}.`);
    } catch(error) { if (['calendar_locked','calendar_edit_required','calendar_edit_expired','closed_period'].includes(error.code)) this.calendar?.lose(error.message); if (!this.disposed) showError(error); }
    finally { this.fillingRoster = false; this.editingTransition = false; if (!this.disposed && !this.loadFailed) this.render(); }
  }
  async addJobs(id) {
    const day = this.days.find(item => item.id === id), editor = this.editor;
    if (!day || !this.editable || day.rows.length >= MAX_WORK_ROWS) return;
    try {
      await editor.acquire(day);
      if (!this.editable || editor !== this.editor) return;
      if (!addWorkRows(day)) return;
      this.expanded.add(day.date); editor.changed(day); this.renderDay(day);
    } catch(error) { if (!this.disposed) showError(error); }
  }
  removeJob(id, jobId) {
    const day = this.days.find(item => item.id === id);
    const job = day?.rows.find(item => item.id === jobId);
    if (!job || !this.editable) return;
    const remove = async () => {
      const editor = this.editor;
      if (!this.editable || !this.days.includes(day)) throw Error('Режим редактирования завершен.');
      await editor.acquire(day);
      if (!this.editable || editor !== this.editor || !this.days.includes(day)) throw Error('Режим редактирования завершен.');
      if (!removeWorkRow(day,jobId)) return;
      editor.changed(day); this.renderDay(day);
      await editor.flush();
    };
    if (hasWorkContent(job)) openDialog('Удалить работу?',`<p>Работа за ${formatDate(day.date)}${job.time ? `, ${escape(job.time)}` : ''} будет удалена.</p>${job.object || job.task ? `<p>${escape(job.object || job.task)}</p>` : ''}`,remove,{submit:'Удалить работу'});
    else void remove().catch(error => { if (!this.disposed) showError(error); });
  }
  allocate(day) {
    if (!this.editable) return;
    const employees = [...new Set(day.roster.filter(Boolean))];
    if (!employees.length) { toast('Сначала заполните состав смены.',true); return; }
    const amounts = new Map((day.employeeAdjustments || []).map(item => [item.employeeId,item]));
    const dialog = openDialog('Штрафы и премии сотрудникам',`<p class="muted">Отрицательная сумма — штраф, положительная — премия. Итог смены будет равен сумме распределенных значений.</p><table class="allocation-table"><thead><tr><th>Сотрудник</th><th>Сумма, ₽</th><th>Комментарий</th></tr></thead><tbody>${employees.map((id,index) => `<tr><td>${escape(state.employeeName(id))}</td><td><input name="amount-${index}" type="number" step="0.01" value="${escape(amounts.get(id)?.amount ?? '')}" aria-label="Сумма: ${escape(state.employeeName(id))}"></td><td><textarea name="comment-${index}" rows="2" aria-label="Комментарий: ${escape(state.employeeName(id))}">${escape(amounts.get(id)?.comment || '')}</textarea></td></tr>`).join('')}</tbody></table><p>Итого: <strong data-allocation-total>0 ₽</strong></p>`,async data => {
      if (!this.editable) throw Error('Режим редактирования завершен.');
      await this.editor.acquire(day);
      if (!this.editable) throw Error('Режим редактирования завершен.');
      const adjustments = employees.map((id,index) => ({employeeId:id,amount:this.numeric(data.get(`amount-${index}`)),comment:String(data.get(`comment-${index}`) || '')})).filter(item => item.amount !== null);
      day.employeeAdjustments = adjustments; day.adjustment = Math.round(adjustments.reduce((sum,item) => sum + item.amount,0)*100)/100;
      this.editor.changed(day); await this.editor.flush(); this.render(); toast('Корректировки распределены');
    },{wide:true});
    const update = () => { const sum = [...dialog.querySelectorAll('input[type="number"]')].reduce((total,input) => total + Number(input.value || 0),0); dialog.querySelector('[data-allocation-total]').textContent = `${number(sum)} ₽`; };
    dialog.querySelectorAll('input[type="number"]').forEach(input => input.oninput = update); update();
  }
  warningText(day) {
    let text = (day.calculated?.warnings || []).map(item => typeof item === 'string' ? item : item.message || item.code).join(' · ');
    (state.references.employees || []).forEach(employee => { text = text.replaceAll(`${employee.id}:`,`${employee.shortName || employee.name}:`); });
    return text;
  }
  personalPaySummary() {
    let amount = 0, counted = 0, hidden = 0, pending = 0;
    for (const day of this.days) {
      if (!day.financeVisible) { hidden++; continue; }
      if (day.calculated?.pending || day.pay === null || day.pay === undefined || day.pay === '' || !Number.isFinite(Number(day.pay))) { pending++; continue; }
      amount += Number(day.pay); counted++;
    }
    const unavailable = hidden + pending;
    const details = [hidden ? `Еще не отображается смен: ${hidden}.` : '', pending ? `Ожидают расчета смен: ${pending}.` : ''].filter(Boolean).join(' ');
    return {amount:!this.employeeId || (unavailable && !counted) ? null : Math.round(amount * 100) / 100,
      note:unavailable ? `${counted ? 'Частичный итог. ' : ''}${details}` : ''};
  }
  updateTotals(day) {
    const total = this.days.reduce((sum,item) => sum + Number((this.personal ? item.hours : item.calculated?.hours ?? item.hours) ?? 0),0);
    const target = this.container.querySelector('[data-month-hours]'); if (target) target.textContent = `${number(total)} ч`;
    if (this.personal) {
      const pay = this.personalPaySummary();
      const amount = this.container.querySelector('[data-month-pay]');
      const note = this.container.querySelector('[data-month-pay-note]');
      if (amount) amount.textContent = pay.amount === null ? '—' : `${number(pay.amount)} ₽`;
      if (note) { note.textContent = pay.note; note.hidden = !pay.note; }
    }
    if (day) {
      const summary = [...this.container.querySelectorAll('[data-day-summary]')].find(element => element.dataset.daySummary === day.id);
      if (summary) summary.textContent = `${number((this.personal ? day.hours : day.calculated?.hours) ?? 0)} ч · ${day.rows.filter(row => row.type || row.task || row.object || row.objectExtra || row.notes || row.notesExtra).length} работ`;
      const pay = [...this.container.querySelectorAll('[data-day-pay]')].find(element => element.dataset.dayPay === day.id);
      if (pay) pay.textContent = `Расчет: ${number(day.calculated?.pay)} ₽`;
      const warning = [...this.container.querySelectorAll('[data-warning]')].find(element => element.dataset.warning === day.id);
      if (warning) { const text = this.warningText(day); warning.hidden = !text; warning.firstElementChild.textContent = text; }
      this.updateParticipantInputs(day);
    }
    const types = new Map(); this.days.forEach(item => item.rows.forEach(row => { if (row.type) types.set(row.type,(types.get(row.type)||0) + Number(row.hours||0)); }));
    const summary = this.container.querySelector('[data-type-totals]'); if (summary) summary.innerHTML = [...types].map(([type,hours]) => `<div><span>${escape(type)}</span><strong>${number(hours)} ч</strong></div>`).join('');
  }
  updateParticipantInputs(day) {
    const jobs = new Map(day.rows.map(row => [row.id,row]));
    this.container.querySelectorAll('.job-row').forEach(element => {
      if (element.dataset.shift !== day.id) return;
      const job = jobs.get(element.dataset.job);
      element.querySelectorAll('[data-person]').forEach(select => {
        const slot = Number(select.dataset.person); select.value = job?.people?.[slot] ?? day.roster[slot] ?? '';
      });
    });
  }
  async loadSummary() {
    const target = this.container.querySelector('[data-summary]'); if (!target) return;
    try {
      const result = await api.get(`/summary?${query({date:state.currentDate})}`); if (!target.isConnected) return;
      target.innerHTML = (result.brigades || []).slice(0,4).map(brigade => `<div class="summary-card"><h3><span>${escape(brigade.code || brigade.label)}</span><button type="button" class="icon-button graph-mode-button" data-open-brigade="${escape(brigade.id)}" title="Открыть график ${escape(brigade.code || brigade.label)} на весь экран" aria-label="Открыть график ${escape(brigade.code || brigade.label)} на весь экран">${graphModeIcon()}</button></h3><table><thead><tr><th>Дата</th><th>Бригадир</th><th>Осн. напарник</th><th>Доп. №1</th><th>Доп. №2</th></tr></thead><tbody>${(brigade.days || []).map(day => `<tr><td>${formatDate(day.date).slice(0,5)}</td>${[0,1,2,3].map(slot => `<td>${escape(day.names?.[slot] || state.employeeName(day.roster?.[slot]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('');
      target.querySelectorAll('[data-open-brigade]').forEach(button => button.onclick = () => this.changeBrigade(button.dataset.openBrigade,{graphOnly:true}));
    } catch(error) { if (target.isConnected) target.textContent = 'Сводка временно недоступна.'; }
  }
}
