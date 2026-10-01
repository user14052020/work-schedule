import {api,query} from './api-client.js';
import {state,formatDate,monthNames} from './state.js';
import {escape,options,option,toast,loading,failure,openDialog,pageHeading} from './ui.js';

const isoDate = (year,month,day) => `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
const dayCount = (from,to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`))/86400000)+1;
const intervalFrom = row => row.from || row.startDate;
const intervalTo = row => row.to || row.endDate;
const weekdays = ['ВС','ПН','ВТ','СР','ЧТ','ПТ','СБ'];

/** Clip spanning intervals to the visible month and give overlapping bars separate lanes. */
export function monthLayout(year,month,rows) {
  const days = new Date(Date.UTC(year,month,0)).getUTCDate();
  const from = isoDate(year,month,1), to = isoDate(year,month,days);
  const segments = rows.filter(row => intervalFrom(row) <= to && intervalTo(row) >= from).map(row => {
    const clippedFrom = intervalFrom(row) < from ? from : intervalFrom(row);
    const clippedTo = intervalTo(row) > to ? to : intervalTo(row);
    return {row,start:Number(clippedFrom.slice(8,10)),end:Number(clippedTo.slice(8,10)),
      continuesBefore:intervalFrom(row) < from,continuesAfter:intervalTo(row) > to};
  }).sort((left,right) => left.start-right.start || right.end-left.end || String(left.row.id).localeCompare(String(right.row.id)));
  const laneEnds = [];
  for (const segment of segments) {
    let lane = laneEnds.findIndex(end => end < segment.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = segment.end;
    segment.lane = lane;
  }
  return {days,segments,lanes:Math.max(1,laneEnds.length)};
}

export class VacationsView {
  constructor(container) {
    this.container = container; this.year = Number(state.period.slice(0,4)); this.rows = [];
    this.mode = 'calendar'; this.employeeId = ''; this.disposed = false; this.request = 0;
  }
  async mount() { await this.load(); }
  async load() {
    if (this.disposed) return;
    const request = ++this.request;
    loading(this.container);
    try {
      const data = await api.get(`/vacations?${query({year:this.year})}`);
      if (this.disposed || request !== this.request) return;
      this.rows = Array.isArray(data) ? data : data.items || data.vacations || [];
      this.render();
    } catch(error) { if (!this.disposed && request === this.request) failure(this.container,error,() => this.load()); }
  }
  closed(year = this.year) {
    return state.years.some(item => Number(item.year || item) === year && item.closed);
  }
  canEdit(row) {
    if (!state.admin || this.closed()) return false;
    if (row?.id) {
      for (let year = Number(intervalFrom(row).slice(0,4)); year <= Number(intervalTo(row).slice(0,4)); year++) {
        if (this.closed(year)) return false;
      }
    }
    return true;
  }
  visibleRows() {
    return this.rows.filter(row => !this.employeeId || row.employeeId === this.employeeId)
      .sort((left,right) => intervalFrom(left).localeCompare(intervalFrom(right)) || String(left.id).localeCompare(String(right.id)));
  }
  render() {
    if (this.disposed) return;
    const years = [...new Set([...state.years.map(item => Number(item.year || item)),
      ...[-2,-1,0,1,2].map(offset => this.year+offset)])].filter(year => year >= 1900 && year <= 9999).sort((a,b) => a-b);
    const rows = this.visibleRows();
    const employees = (state.references.employees || []).filter(employee => employee.active || this.rows.some(row => row.employeeId === employee.id));
    const total = rows.reduce((sum,row) => sum+dayCount(intervalFrom(row) < `${this.year}-01-01` ? `${this.year}-01-01` : intervalFrom(row),
      intervalTo(row) > `${this.year}-12-31` ? `${this.year}-12-31` : intervalTo(row)),0);
    this.container.innerHTML = `<section class="vacations-view">${pageHeading('Отпуска',
      state.editable ? 'Календарь года: месяцы по строкам, дни по столбцам.' : 'Ваши периоды отпусков в календаре года.',
      this.canEdit() ? '<button class="primary" data-add>＋ Добавить отпуск</button>' : '')}
      <div class="vacation-toolbar">
        <div class="vacation-year"><button class="button" data-year-step="-1" aria-label="Предыдущий год" ${this.year <= 1900 ? 'disabled' : ''}>‹</button><label>Год <select data-year>${years.map(year => option(year,year,this.year)).join('')}</select></label><button class="button" data-year-step="1" aria-label="Следующий год" ${this.year >= 9999 ? 'disabled' : ''}>›</button></div>
        ${state.editable ? `<label>Сотрудник <select data-employee>${options(employees,this.employeeId,{empty:'Все сотрудники',label:'name'})}</select></label>` : ''}
        <div class="vacation-view-switch" aria-label="Вид отпусков"><button data-mode="calendar" aria-pressed="${this.mode === 'calendar'}">Календарь</button><button data-mode="list" aria-pressed="${this.mode === 'list'}">Список</button></div>
        ${this.closed() ? '<span class="badge">Год закрыт</span>' : ''}
      </div>
      <div class="vacation-caption"><span><i class="vacation-legend" aria-hidden="true"></i>Полоса — период отпуска. Нажмите, чтобы ${this.canEdit() ? 'изменить' : 'посмотреть даты'}.</span><span>${rows.length} периодов · ${total} дней отпуска за год</span></div>
      ${this.mode === 'calendar' ? this.calendar(rows) : this.list(rows)}
      ${this.mode === 'calendar' ? '<p class="vacation-footnote">Дни между датами начала и окончания включены в отпуск. Переходящий отпуск продолжается в следующем месяце.</p>' : ''}
    </section>`;
    this.container.querySelector('[data-year]').onchange = event => { this.year = Number(event.target.value); this.load(); };
    this.container.querySelectorAll('[data-year-step]').forEach(button => button.onclick = () => { this.year += Number(button.dataset.yearStep); this.load(); });
    this.container.querySelector('[data-employee]')?.addEventListener('change',event => { this.employeeId = event.target.value; this.render(); });
    this.container.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => { this.mode = button.dataset.mode; this.render(); });
    this.container.querySelector('[data-add]')?.addEventListener('click',() => this.edit());
    this.container.querySelectorAll('[data-month-add]').forEach(button => button.onclick = () => this.edit({from:isoDate(this.year,Number(button.dataset.monthAdd),1),to:isoDate(this.year,Number(button.dataset.monthAdd),1)}));
    this.container.querySelectorAll('[data-event],[data-edit]').forEach(button => button.onclick = () => {
      const row = this.rows.find(item => String(item.id) === (button.dataset.event || button.dataset.edit));
      if (row) this.canEdit(row) ? this.edit(row) : this.details(row);
    });
    this.container.querySelectorAll('[data-delete]').forEach(button => button.onclick = () => this.remove(this.rows.find(row => String(row.id) === button.dataset.delete)));
  }
  calendar(rows) {
    return `<div class="vacation-calendar-scroll" tabindex="0" role="region" aria-label="Годовой календарь отпусков ${this.year}"><div class="vacation-calendar">
      <div class="vacation-day-header"><div class="vacation-corner">${this.year}</div>${Array.from({length:31},(_,index) => `<div>${index+1}</div>`).join('')}</div>
      ${monthNames.map((name,index) => this.month(name,index+1,rows)).join('')}
    </div></div>`;
  }
  month(name,month,rows) {
    const layout = monthLayout(this.year,month,rows);
    const dayCells = Array.from({length:31},(_,index) => {
      const day = index+1;
      const weekday = day <= layout.days ? new Date(Date.UTC(this.year,month-1,day)).getUTCDay() : null;
      return {day,weekday,weekend:weekday === 0 || weekday === 6,invalid:day > layout.days,today:isoDate(this.year,month,day) === state.currentDate};
    });
    const cells = dayCells.map(cell => `<div class="vacation-weekday ${cell.invalid ? 'invalid' : ''} ${cell.weekend ? 'weekend' : ''} ${cell.today ? 'today' : ''}" style="grid-column:${cell.day+1};grid-row:1" ${cell.today ? 'aria-current="date"' : ''}>${cell.invalid ? '' : weekdays[cell.weekday]}</div>`).join('');
    const lanes = Array.from({length:layout.lanes},(_,index) => dayCells.map(cell => `<div aria-hidden="true" class="vacation-grid-cell ${cell.invalid ? 'invalid' : ''} ${cell.weekend ? 'weekend' : ''} ${cell.today ? 'today' : ''}" style="grid-column:${cell.day+1};grid-row:${index+2}"></div>`).join('')).join('');
    const bars = layout.segments.map(segment => {
      const name = state.employeeName(segment.row.employeeId);
      const title = `${name}: ${formatDate(intervalFrom(segment.row))} — ${formatDate(intervalTo(segment.row))}`;
      return `<button class="vacation-bar ${segment.continuesBefore ? 'continues-before' : ''} ${segment.continuesAfter ? 'continues-after' : ''}" data-event="${escape(segment.row.id)}" title="${escape(title)}" aria-label="${escape(title)}" style="grid-column:${segment.start+1} / span ${segment.end-segment.start+1};grid-row:${segment.lane+2}">${segment.continuesBefore ? '<span aria-hidden="true">‹</span>' : ''}<span class="vacation-bar-name">${escape(name)}</span>${segment.continuesAfter ? '<span aria-hidden="true">›</span>' : ''}</button>`;
    }).join('');
    return `<section class="vacation-month" aria-label="${name} ${this.year}"><div class="vacation-month-name" style="grid-row:1 / span ${layout.lanes+1}"><strong>${name}</strong><small>${layout.days} дн.</small>${this.canEdit() ? `<button class="text-button" data-month-add="${month}" aria-label="Добавить отпуск: ${name}">＋</button>` : ''}</div>${cells}${lanes}${bars}${!layout.segments.length ? '<div class="vacation-no-events" style="grid-column:2 / 20;grid-row:2">Отпусков нет</div>' : ''}</section>`;
  }
  list(rows) {
    return `<div class="data-table-scroll"><table class="data-table"><thead><tr><th>Сотрудник</th><th>Начало</th><th>Окончание</th><th>Дней</th>${state.admin ? '<th>Действия</th>' : ''}</tr></thead><tbody>${rows.map(row => `<tr><td>${escape(state.employeeName(row.employeeId))}</td><td>${formatDate(intervalFrom(row))}</td><td>${formatDate(intervalTo(row))}</td><td>${dayCount(intervalFrom(row),intervalTo(row))}</td>${state.admin ? `<td>${this.canEdit(row) ? `<button class="text-button" data-edit="${escape(row.id)}">Изменить</button><button class="text-button danger" data-delete="${escape(row.id)}">Удалить</button>` : '<span class="muted">Год закрыт</span>'}</td>` : ''}</tr>`).join('')}</tbody></table>${!rows.length ? '<p class="empty-state">Отпуска за этот год не указаны.</p>' : ''}</div>`;
  }
  edit(row = {}) {
    if (!this.canEdit(row)) return;
    const employees = (state.references.employees || []).filter(employee => employee.active || employee.id === row.employeeId);
    const from = intervalFrom(row) || (state.currentDate.startsWith(`${this.year}-`) ? state.currentDate : `${this.year}-01-01`);
    openDialog(row.id ? 'Изменить отпуск' : 'Добавить отпуск',`<label>Сотрудник<select name="employeeId" required>${options(employees,row.employeeId || this.employeeId,{label:'name'})}</select></label><div class="form-grid"><label>Начало<input name="from" type="date" value="${escape(from)}" required></label><label>Окончание<input name="to" type="date" value="${escape(intervalTo(row) || from)}" required></label></div><label class="check-label"><input type="checkbox" name="applyToSchedule">Проставить отпуск в графике</label><label class="check-label"><input type="checkbox" name="confirmConflicts">Подтверждаю исключение сотрудника из работ, совпадающих с отпуском</label><p class="muted small">Изменение графика применяется только при выбранных соответствующих пунктах.</p>`,async data => {
      if (data.get('from') > data.get('to')) throw Error('Окончание отпуска не может быть раньше начала.');
      const payload = {employeeId:data.get('employeeId'),from:data.get('from'),to:data.get('to'),applyToSchedule:data.has('applyToSchedule'),confirmConflicts:data.has('confirmConflicts'),expectedVersion:row.version};
      if (row.id) await api.put(`/vacations/${encodeURIComponent(row.id)}`,payload); else await api.post('/vacations',payload);
      await this.load(); if (!this.disposed) toast('Отпуск сохранен');
    });
  }
  details(row) {
    openDialog('Период отпуска',`<p><strong>${escape(state.employeeName(row.employeeId))}</strong></p><p>${formatDate(intervalFrom(row))} — ${formatDate(intervalTo(row))}<br>Продолжительность: ${dayCount(intervalFrom(row),intervalTo(row))} дн.</p>`);
  }
  remove(row) {
    if (!row || !this.canEdit(row)) return;
    openDialog('Удалить отпуск?',`<p>${escape(state.employeeName(row.employeeId))}: ${formatDate(intervalFrom(row))} — ${formatDate(intervalTo(row))}.</p><p class="muted">Ранее исключенное участие в работах не восстановится автоматически.</p>`,async () => { await api.delete(`/vacations/${encodeURIComponent(row.id)}`); await this.load(); if (!this.disposed) toast('Отпуск удален'); },{submit:'Удалить'});
  }
  async dispose() { this.disposed = true; this.request++; }
}
