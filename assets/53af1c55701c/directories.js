import {api} from './api-client.js';
import {state,number} from './state.js';
import {escape,options,option,toast,showError,loading,failure,openDialog,pageHeading,safeColor} from './ui.js';
import {payrollFields,readPayrollFields,bindPositionPaymentFields} from './payroll-fields.js';
import {ViewLifecycle} from './view-lifecycle.js';
import {UsersView} from './users.js';

const definitions = {
  employees:{title:'Сотрудники',fields:[['name','ФИО'],['shortName','Краткое имя'],['group','Группа','group'],['positionId','Должность','positions'],['roleId','Роль новой учетной записи','roles'],['driver','Водитель','checkbox']]},
  brigades:{title:'Бригады',fields:[['code','Обозначение'],['label','Название']]},
  positions:{title:'Должности',fields:[['code','Код'],['label','Название'],['color','Цвет','color']]},
  workTypes:{title:'Виды работ',fields:[['code','Код'],['label','Название'],['color','Цвет','color']]},
  statuses:{title:'Статусы сотрудников',fields:[['code','Код'],['label','Название'],['color','Цвет','color']]},
  invoiceStates:{title:'Статусы счета',fields:[['code','Код'],['label','Название'],['color','Цвет','color']]},
  rates:{title:'Ставки оплаты',fields:[['fromDate','Дата начала действия','date'],['statusCode','Статус','statuses'],['minHours','От часов','number'],['maxHours','До часов','number'],['driver','Ставка водителя, ₽','number'],['nonDriver','Ставка сотрудника, ₽','number']]},
  roles:{title:'Роли',fields:[['code','Код'],['label','Название']]}
};

export class DirectoriesView {
  constructor(container) { this.container = container; this.kind = 'brigades'; this.rows = []; this.lifecycle = new ViewLifecycle(); this.usersView = null; }
  async mount() { await this.load(); }
  async load() {
    if (this.lifecycle.disposed) return;
    if (this.kind === 'users' && !state.admin) this.kind = 'brigades';
    const request = this.lifecycle.begin(), kind = this.kind;
    if (this.usersView) { await this.usersView.dispose(); this.usersView = null; }
    if (!request.current()) return;
    if (kind === 'users' && state.admin) {
      this.container.innerHTML = pageHeading('Справочники','Доступ к системе, пароли и блокировка учетных записей.') + this.tabs() + '<section data-users-content></section>';
      this.bindTabs();
      this.usersView = new UsersView(this.container.querySelector('[data-users-content]'),{embedded:true});
      await this.usersView.mount();
      return;
    }
    loading(this.container);
    try { const data = await api.get(`/dictionaries/${kind}`,{signal:request.signal}); if (!request.current()) return; this.rows = Array.isArray(data) ? data : data.items || data.records || []; this.render(); }
    catch(error) { if (request.current() && error.name !== 'AbortError') failure(this.container,error,() => this.load()); }
  }
  tabs() {
    const sections = [...Object.entries(definitions),...(state.admin ? [['users',{title:'Пользователи'}]] : [])];
    return `<div class="tabs">${sections.map(([key,value]) => `<button class="${key === this.kind ? 'active' : ''}" data-kind="${key}" ${key === this.kind ? 'aria-current="page"' : ''}>${value.title}</button>`).join('')}</div>`;
  }
  bindTabs() {
    this.container.querySelectorAll('[data-kind]').forEach(button => button.onclick = () => { this.kind = button.dataset.kind; this.load(); });
  }
  render() {
    if (this.lifecycle.disposed) return;
    const definition = definitions[this.kind]; const writable = state.admin;
    this.container.innerHTML = pageHeading('Справочники','Значения используются в графиках и расчетах.',writable ? '<button class="primary" data-add>＋ Добавить запись</button>' : '') + this.tabs() +
      `<div class="list-toolbar"><h2>${definition.title}</h2><label class="search-input">Поиск <input data-filter placeholder="Найти запись"></label><span class="muted">${this.rows.length} записей</span></div><div class="data-table-scroll"><table class="data-table"><thead><tr>${definition.fields.map(([,label]) => `<th>${label}</th>`).join('')}<th>Состояние</th>${writable ? '<th></th>' : ''}</tr></thead><tbody>${this.rows.map(record => `<tr data-record="${escape(record.id)}" class="${record.active === false ? 'inactive' : ''}">${definition.fields.map(([field,,type]) => `<td>${this.display(record,field,type)}</td>`).join('')}<td>${record.active === false ? 'Отключена' : 'Активна'}</td>${writable ? `<td><button class="text-button" data-edit="${escape(record.id)}">Изменить</button></td>` : ''}</tr>`).join('')}</tbody></table>${!this.rows.length ? '<p class="empty-state">Записей пока нет.</p>' : ''}</div>`;
    this.bindTabs();
    this.container.querySelector('[data-add]')?.addEventListener('click',() => this.edit());
    this.container.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => this.edit(this.rows.find(record => String(record.id) === button.dataset.edit)));
    this.container.querySelector('[data-filter]').oninput = event => { const value = event.target.value.toLocaleLowerCase('ru'); this.container.querySelectorAll('[data-record]').forEach(row => row.hidden = !row.textContent.toLocaleLowerCase('ru').includes(value)); };
  }
  display(record,field,type) {
    if (type === 'checkbox') return record[field] ? 'Да' : 'Нет';
    if (type === 'color') return `<span class="color-dot" style="background:${safeColor(record[field])}"></span> ${escape(record[field])}`;
    if (definitions[type] || ['positions','roles','statuses'].includes(type)) {
      const key = type === 'statuses' ? 'code' : 'id'; const item = (state.references[type] || []).find(row => String(row[key]) === String(record[field]));
      return escape(item?.label || item?.name || record[field] || '—');
    }
    if (type === 'group') return record[field] === 'office' ? 'Офис' : record[field] === 'field' ? 'Поля' : escape(record[field]);
    return escape(type === 'number' ? number(record[field]) : record[field] || '—');
  }
  field(record,[field,label,type = 'text']) {
    if (!state.admin && this.kind === 'employees' && ['positionId','roleId','driver'].includes(field)) return `<label>${label}<div class="read-value">${this.display(record,field,type)}</div></label>`;
    const required = ['name','code','label','fromDate'].includes(field) ? 'required' : '';
    let control;
    if (type === 'checkbox') control = `<input type="checkbox" name="${field}" ${record[field] ? 'checked' : ''}>`;
    else if (type === 'group') control = `<select name="${field}">${option('Поля','Поля',record[field] || 'Поля')}${option('Офис','Офис',record[field])}</select>`;
    else if (['positions','roles','statuses'].includes(type)) control = `<select name="${field}">${options(state.references[type],record[field],{value:type === 'statuses' ? 'code' : 'id'})}</select>`;
    else control = `<input name="${field}" type="${type}" value="${escape(type === 'color' ? record[field] || '#e8eee9' : record[field] ?? '')}" ${required} ${type === 'number' ? 'step="any" min="0"' : ''}>`;
    return `<label class="${type === 'checkbox' ? 'check-label' : ''}">${label}${control}</label>`;
  }
  edit(record = {}) {
    if (this.lifecycle.disposed || !state.admin) return;
    const kind = this.kind, definition = definitions[kind];
    const financial = state.admin && ['employees','positions','statuses','workTypes','rates'].includes(kind);
    const additional = (state.admin ? payrollFields(kind,record) : '') + (financial ? `<label>Начало действия расчетных условий<input name="effectiveFrom" type="date" min="${escape(state.currentDate)}"></label><p class="muted small">Необязательно. Дата применяется только при изменении расчетных условий. Пустое поле сохраняет дату по умолчанию.</p>` : '');
    const dialog = openDialog(record.id ? `Изменить: ${definition.title.toLowerCase()}` : `Новая запись: ${definition.title.toLowerCase()}`,`<div class="form-grid">${definition.fields.map(field => this.field(record,field)).join('')}</div>${additional}<label class="check-label"><input type="checkbox" name="active" ${record.active !== false ? 'checked' : ''}>Активная запись</label>`,async data => {
      const updated = {...record,active:data.has('active')};
      definition.fields.forEach(([field,,type]) => { if (!state.admin && kind === 'employees' && ['positionId','roleId','driver'].includes(field)) return; const value = data.get(field); updated[field] = type === 'checkbox' ? data.has(field) : type === 'number' ? (value === '' ? null : Number(value)) : value; });
      if (state.admin) Object.assign(updated,readPayrollFields(kind,record,data));
      if (financial) { delete updated.effectiveFrom; if (data.get('effectiveFrom')) updated.effectiveFrom = data.get('effectiveFrom'); }
      if (record.id) await api.put(`/dictionaries/${kind}/${encodeURIComponent(record.id)}`,{record:updated,expectedVersion:record.version});
      else await api.post(`/dictionaries/${kind}`,updated);
      if (this.lifecycle.disposed) return;
      const bootstrap = await api.get('/bootstrap'); if (this.lifecycle.disposed) return; state.initialize(bootstrap);
      await this.load(); if (!this.lifecycle.disposed) toast('Справочник сохранен');
    },{wide:true});
    if (state.admin && this.kind === 'positions') bindPositionPaymentFields(dialog.querySelector('form'),record);
  }
  async dispose() { this.lifecycle.dispose(); if (this.usersView) await this.usersView.dispose(); }
}
