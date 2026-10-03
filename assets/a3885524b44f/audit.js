import {api,query} from './api-client.js';
import {state} from './state.js';
import {escape,loading,failure,pageHeading} from './ui.js';

const roles = {admin:'Администратор',office:'Офис',field:'Поле'};
const slots = ['Бригадир','Основной напарник','Дополнительный напарник №1','Дополнительный напарник №2','Дополнительный сотрудник'];
const entities = {shift:'График',brigade:'Бригада',brigades:'Бригады',employees:'Сотрудники',positions:'Должности',workTypes:'Виды работ',statuses:'Статусы сотрудников',invoiceStates:'Статусы счета',rates:'Ставки оплаты',roles:'Роли',user:'Пользователи',vacation:'Отпуска',year:'Архив',settings:'Настройки'};
const actions = {login:'Вход в систему',logout:'Выход из системы',password_changed:'Изменен пароль',password_reset:'Сброшен пароль',user_created:'Создан пользователь',user_updated:'Изменен пользователь',reference_created:'Добавлена запись',reference_updated:'Изменена запись',reference_deleted:'Удалена запись',shift_saved:'Сохранена смена',roster_applied:'Применен состав бригады',vacation_created:'Добавлен отпуск',vacation_updated:'Изменен отпуск',vacation_deleted:'Удален отпуск',year_created:'Создан год',year_closed:'Закрыт год',year_reopened:'Открыт год',settings_updated:'Изменены пояснения',references_imported:'Загружены справочники'};
Object.assign(actions,{shift_roster_applied:'Применен состав смены',shift_vacation_applied:'Проставлен отпуск в смене',monthly_roster_updated:'Изменен состав бригады на месяц',legacy_payroll_recalculated:'Подтвержден перерасчет архивной смены'});
entities.monthly_roster = 'Состав бригады на месяц';
const fields = {
  name:'Имя',shortName:'Краткое имя',login:'Логин',code:'Обозначение',label:'Название',active:'Активная запись',group:'Группа',positionId:'Должность',roleId:'Роль новой учетной записи',role:'Роль учетной записи',systemRole:'Роль учетной записи',driver:'Водитель',nonDriver:'Ставка сотрудника, ₽',employeeId:'Сотрудник',brigadeId:'Бригада',date:'Дата',year:'Год',period:'Месяц',from:'Начало',to:'Окончание',fromDate:'Дата начала действия',startDate:'Начало',endDate:'Окончание',minHours:'От часов',maxHours:'До часов',statusCode:'Статус ставки',color:'Цвет',closed:'Год закрыт',pay:'Зарплата за смену, ₽',hours:'Часов за смену',hoursOverride:'Часов за смену (вручную)',adjustment:'Штраф / премия, ₽',adjustmentComment:'Комментарий к штрафу / премии',overrideReason:'Основание ручного расчета',amount:'Сумма, ₽',comment:'Комментарий',reason:'Основание',shiftHelp:'Пояснение к составу смены',usageHelp:'Как пользоваться',applyToSchedule:'Проставить отпуск в графике',applied:'Отпуск применен к графику',affectedShifts:'Количество затронутых смен',assignmentsRestored:'Участие в работах восстановлено',updated:'Количество измененных смен',shifts:'Количество смен',mode:'Способ применения состава',mustChangePassword:'Требуется смена пароля',
  description:'Описание',paymentNote:'Пояснение к оплате',kind:'Правило расчета',payrollKind:'Оплата статуса',rateStatusCode:'Статус ставки',participates:'Участие в работах',allowZeroDay:'Расчет нулевой смены',isTravel:'Переезд / проезд',bonusAmount:'Фиксированная надбавка, ₽',bonusPercent:'Надбавка, %',bonusMultiplier:'Доля бригадирской надбавки',deductionPercent:'Удержание на обучение, %',deductionBase:'База удержания',maxBrigadeHours:'Предельная нагрузка бригады, ч',rounding:'Округление до копеек',phase:'Этап обучения',teacherId:'Учитель',trialDailyAmount:'Оплата пробного дня, ₽',trainingPayKind:'Оплата обучения',trainingDailyAmount:'Оплата дня обучения, ₽'
};
const jobFields = {time:'Время',invoice:'Счет',type:'Вид работ',hours:'Часов на бригаду',objectId:'Артикул',object:'Объект',objectExtra:'Дополнительная строка объекта',phone:'Телефон работ',objectNotes:'Примечания по объекту',task:'ТЗ на работы',notes:'Примечания по работам / доп. ТЗ',notesExtra:'Дополнительная строка примечаний',tech:'Техбаза',tech2:'Техбаза — вторая ссылка'};
fields.effectiveFrom = 'Дата начала действия условий';
fields.showEmployeePayImmediately = 'Показывать зарплату сотруднику сразу';
actions.settings_updated = 'Изменены настройки';
const enums = {
  group:{office:'Офис',field:'Поля'},role:roles,systemRole:roles,
  kind:{work:'Рабочий день',duty:'Дежурство',leave:'Отпуск',other:'Другой',standard:'По ставкам',brigadier:'Бригадир',trainee:'Стажер',apprentice:'Ученик'},
  payrollKind:{work:'По часам и ставкам',leave:'Отпускная ставка',none:'Без оплаты',pending:'Требует настройки'},
  deductionBase:{base:'Базовая ставка',gross:'Начисление с надбавками'},rounding:{half_up:'Математическое',down:'В меньшую сторону'},
  phase:{trial:'Пробный период',training:'Обучение',internship:'Стажировка'},trainingPayKind:{base:'По базовой ставке',fixed:'Фиксированная сумма'},mode:{empty:'Только незаполненные дни',all:'Все дни'}
};
const referenceFields = {employeeId:'employees',teacherId:'employees',positionId:'positions',roleId:'roles',brigadeId:'brigades',statusCode:'statuses',rateStatusCode:'statuses',invoice:'invoiceStates',type:'workTypes'};
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (object,key) => Object.prototype.hasOwnProperty.call(object || {},key);
const present = value => value !== null && value !== undefined && value !== '';
const same = (left,right) => (left ?? '') === (right ?? '');
function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '—';
  return String(value).split('-').reverse().join('.');
}
function time(value) {
  const raw = String(value || '');
  const parsed = new Date(raw.includes('T') ? raw : raw.replace(' ','T')+'Z');
  return Number.isNaN(parsed.getTime()) ? 'Дата не указана' : parsed.toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'medium'});
}
function reference(kind,value) {
  if (!present(value)) return '—';
  const record = (state.references[kind] || []).find(item => String(item.id) === String(value) || String(item.code) === String(value));
  if (record) return record.name || record.label || record.shortName || record.code || 'Запись справочника';
  // Status and work codes are business values; missing opaque identifiers are not.
  if (['statuses','workTypes','invoiceStates'].includes(kind) && /^[\p{L}\p{N} +/().-]{1,24}$/u.test(String(value)) && !/^[0-9a-f-]{24,}$/i.test(String(value))) return String(value);
  return kind === 'employees' ? 'Сотрудник (нет в текущем справочнике)' : 'Запись (нет в текущем справочнике)';
}
function valueText(value,key,kind) {
  if (!present(value)) return '—';
  if (referenceFields[key]) return reference(referenceFields[key],value);
  if (enums[key]) return enums[key][value] || (/[^\x00-\x7F]/.test(String(value)) ? String(value) : 'Другое значение');
  if (['date','from','to','fromDate','effectiveFrom','startDate','endDate'].includes(key)) return date(value);
  if (key === 'period' && /^\d{4}-\d{2}$/.test(String(value))) return String(value).split('-').reverse().join('.');
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (typeof value === 'number') return value.toLocaleString('ru-RU',{maximumFractionDigits:4});
  if (typeof value !== 'string') return '—';
  return value;
}
function append(changes,label,before,after,key,kind,{adding = false,removing = false} = {}) {
  if (same(before,after)) return;
  if ((adding && !present(after)) || (removing && !present(before))) return;
  changes.push({label,before:valueText(before,key,kind),after:valueText(after,key,kind)});
}
function recordChanges(before,after,kind,changes,prefix = '',path = '') {
  const old = isRecord(before) ? before : {}, next = isRecord(after) ? after : {};
  const adding = !isRecord(before), removing = !isRecord(after);
  for (const key of new Set([...Object.keys(old),...Object.keys(next)])) {
    if (['metadata','training','payroll'].includes(key)) {
      const title = key === 'training' ? 'Обучение' : key === 'payroll' ? 'Расчет зарплаты' : '';
      recordChanges(old[key],next[key],kind,changes,prefix+(title ? title+' · ' : ''),path+'.'+key);
    } else if (fields[key]) {
      const label = key === 'name' && kind === 'employees' ? 'ФИО' : key === 'driver' && kind === 'rates' ? 'Ставка водителя, ₽' : key === 'active' && kind === 'user' ? 'Доступ разрешен' : key === 'kind' && path.endsWith('.metadata') && kind === 'statuses' ? 'Назначение статуса' : fields[key];
      append(changes,prefix+label,old[key],next[key],key,kind,{adding,removing});
    }
  }
}
function meaningfulJob(job) {
  if (!isRecord(job)) return false;
  return Object.keys(jobFields).some(key => key !== 'invoice' && present(job[key])) || (job.people || []).some(present);
}
function shiftChanges(before,after) {
  const old = isRecord(before) ? before : {}, next = isRecord(after) ? after : {}, changes = [];
  recordChanges(before,after,'shift',changes);
  for (let slot = 0; slot < 5; slot++) {
    append(changes,`Состав смены · ${slots[slot]}`,old.roster?.[slot],next.roster?.[slot],'employeeId');
    append(changes,`Статус · ${slots[slot]}`,old.statuses?.[slot],next.statuses?.[slot],'statusCode');
  }
  const oldRows = Array.isArray(old.rows) ? old.rows : [], newRows = Array.isArray(next.rows) ? next.rows : [];
  const oldMap = new Map(oldRows.map((job,index) => [job.id ?? `row-${index}`,{job,index}]));
  const newMap = new Map(newRows.map((job,index) => [job.id ?? `row-${index}`,{job,index}]));
  for (const id of new Set([...oldMap.keys(),...newMap.keys()])) {
    const previous = oldMap.get(id), current = newMap.get(id);
    if (!previous && !meaningfulJob(current?.job) || !current && !meaningfulJob(previous?.job)) continue;
    const label = `Работа №${current?.job._rowNumber ?? previous?.job._rowNumber ?? (current?.index ?? previous.index)+1}`;
    if (previous && current && present(previous.job._rowNumber) && present(current.job._rowNumber)) append(changes,`${label} · Порядок`,previous.job._rowNumber,current.job._rowNumber,'_rowNumber');
    if (!previous || !current) changes.push({label,before:previous ? 'Работа была в графике' : '—',after:current ? 'Добавлена работа' : 'Работа удалена'});
    for (const [key,title] of Object.entries(jobFields)) append(changes,`${label} · ${title}`,previous?.job[key],current?.job[key],key,'shift',{adding:!previous,removing:!current});
    for (let slot = 0; slot < 5; slot++) {
      const oldPerson = previous?.job.people?.[slot], newPerson = current?.job.people?.[slot];
      if (oldPerson === newPerson || (!previous && newPerson == null) || (!current && oldPerson == null)) continue;
      const person = (job,value) => !job ? '—' : value == null ? 'По составу смены' : value === '' ? 'Не участвует' : reference('employees',value);
      changes.push({label:`${label} · ${slots[slot]}`,before:person(previous,oldPerson),after:person(current,newPerson)});
    }
  }
  const adjustments = value => new Map((Array.isArray(value) ? value : []).map(item => [item.employeeId,item]));
  const oldAdjustments = adjustments(old.employeeAdjustments), newAdjustments = adjustments(next.employeeAdjustments);
  for (const id of new Set([...oldAdjustments.keys(),...newAdjustments.keys()])) {
    const previous = oldAdjustments.get(id), current = newAdjustments.get(id);
    const prefix = `Штраф / премия · ${reference('employees',id)} · `;
    for (const key of ['amount','comment']) append(changes,prefix+fields[key],previous?.[key],current?.[key],key,'shift');
  }
  return changes;
}
function detailsFor(item) {
  const details = isRecord(item.details) ? item.details : {};
  if (['login','logout','password_changed','password_reset'].includes(item.action)) return {message:actions[item.action]};
  if (has(details,'before') || has(details,'after')) {
    const shiftLike = ['shift','monthly_roster'].includes(item.entityType);
    const changes = shiftLike ? shiftChanges(details.before,details.after) : [];
    if (!shiftLike) recordChanges(details.before,details.after,item.entityType,changes);
    if (has(details.context,'effectiveFrom')) append(changes,fields.effectiveFrom,null,details.context.effectiveFrom,'effectiveFrom',item.entityType);
    if (has(details,'reason')) append(changes,fields.reason,null,details.reason,'reason',item.entityType);
    const hasBusinessData = [details.before,details.after].some(record => isRecord(record) && Object.keys(record).some(key => fields[key] || ['roster','statuses','rows','employeeAdjustments','metadata','training'].includes(key)));
    return {changes,message:changes.length ? '' : hasBusinessData ? 'Содержательные поля не изменились.' : 'Подробности изменений ранее не сохранялись.'};
  }
  const notes = [];
  for (const key of ['employeeId','from','to','effectiveFrom','mode','updated','affectedShifts','shifts','reason','assignmentsRestored']) {
    if (has(details,key)) notes.push(`${fields[key]}: ${valueText(details[key],key,item.entityType)}`);
  }
  return {message:'Подробности изменений ранее не сохранялись.',notes};
}
function place(item) {
  const details = isRecord(item.details) ? item.details : {};
  const record = isRecord(details.after) ? details.after : isRecord(details.before) ? details.before : {};
  const title = entities[item.entityType] || 'Система';
  if (item.entityType === 'shift') {
    const match = /^(.+):(\d{4}-\d{2}-\d{2})$/.exec(String(item.entityId || ''));
    const brigade = record.brigadeId || match?.[1], workDate = record.date || match?.[2];
    return [title,brigade ? reference('brigades',brigade) : '',workDate ? date(workDate) : ''].filter(Boolean).join(' · ');
  }
  if (item.entityType === 'year') return title+(/^[0-9]{4}$/.test(String(item.entityId)) ? ` · ${item.entityId}` : '');
  if (item.entityType === 'monthly_roster') return [title,record.brigadeId ? reference('brigades',record.brigadeId) : '',record.period ? valueText(record.period,'period') : ''].filter(Boolean).join(' · ');
  if (item.entityType === 'vacation') return [title,record.employeeId || details.employeeId ? reference('employees',record.employeeId || details.employeeId) : '',record.from ? `${date(record.from)} — ${date(record.to)}` : ''].filter(Boolean).join(' · ');
  if (item.entityType === 'rates') return [title,record.statusCode ? reference('statuses',record.statusCode) : '',record.fromDate ? `с ${date(record.fromDate)}` : '',present(record.minHours) ? `${valueText(record.minHours,'minHours')}–${present(record.maxHours) ? valueText(record.maxHours,'maxHours') : '∞'} ч` : ''].filter(Boolean).join(' · ');
  const kind = item.entityType === 'brigade' ? 'brigades' : item.entityType;
  const referenceRecord = (state.references[kind] || []).find(row => String(row.id) === String(item.entityId));
  const label = record.name || record.label || record.code || record.login || details.entityLabel || referenceRecord?.name || referenceRecord?.label || referenceRecord?.code || (item.entityType === 'user' && String(item.entityId) === String(item.userId) ? item.userName || item.userLogin : '');
  return title+(label ? ` · ${label}` : '');
}

export class AuditView {
  constructor(container) { this.container = container; this.page = 1; this.limit = 25; this.items = []; this.total = 0; this.disposed = false; this.request = 0; }
  async mount() { await this.load(); }
  async load(page = this.page) {
    const request = ++this.request;
    loading(this.container);
    try {
      const data = await api.get(`/audit?${query({page,limit:this.limit})}`);
      if (this.disposed || request !== this.request) return;
      this.items = data.items || []; this.total = Number(data.total) || 0;
      this.page = Math.max(1,Number(data.page) || page); this.limit = Math.max(1,Number(data.limit) || this.limit);
      const last = Math.max(1,Math.ceil(this.total/this.limit));
      if (this.page > last) { await this.load(last); return; }
      this.render();
    } catch(error) { if (!this.disposed && request === this.request && error.name !== 'AbortError') failure(this.container,error,() => this.load(page)); }
  }
  render() {
    const pages = Math.max(1,Math.ceil(this.total/this.limit));
    const start = this.total ? (this.page-1)*this.limit+1 : 0, end = Math.min(this.page*this.limit,this.total);
    this.container.innerHTML = `<section class="audit-view">${pageHeading('Журнал действий','Хранятся события за последние 3 календарных месяца.','<button class="button" data-audit-refresh>Обновить</button>')}
      <div class="data-table-scroll"><table class="data-table audit-table"><thead><tr><th scope="col">Когда</th><th scope="col">Пользователь</th><th scope="col">Действие</th><th scope="col">Где</th><th scope="col">Изменения</th></tr></thead><tbody>${this.items.map(item => this.row(item)).join('')}</tbody></table>${this.items.length ? '' : '<p class="empty-state">В журнале пока нет событий.</p>'}</div>
      <div class="audit-pagination"><span class="muted">${start}–${end} из ${this.total}</span><nav aria-label="Страницы журнала"><button class="button" data-audit-page="${this.page-1}" ${this.page <= 1 ? 'disabled' : ''}>Назад</button><span>Страница ${this.page} из ${pages}</span><button class="button" data-audit-page="${this.page+1}" ${this.page >= pages ? 'disabled' : ''}>Далее</button></nav></div>
    </section>`;
    this.container.querySelector('[data-audit-refresh]').onclick = () => this.load();
    this.container.querySelectorAll('[data-audit-page]').forEach(button => button.onclick = () => this.load(Number(button.dataset.auditPage)));
  }
  row(item) {
    const details = detailsFor(item);
    const changes = details.changes || [];
    const content = changes.length ? `<details class="audit-details"><summary>Показать изменения (${changes.length})</summary><table class="audit-changes"><thead><tr><th scope="col">Поле</th><th scope="col">Было</th><th scope="col">Стало</th></tr></thead><tbody>${changes.map(change => `<tr><th scope="row">${escape(change.label)}</th><td>${escape(change.before)}</td><td>${escape(change.after)}</td></tr>`).join('')}</tbody></table></details>` : `<p class="audit-note">${escape(details.message)}</p>${details.notes?.length ? `<details class="audit-details"><summary>Сведения о событии</summary><p class="audit-note">${escape(details.notes.join('\n'))}</p></details>` : ''}`;
    const userName = item.userName || item.userLogin || (item.userId ? 'Пользователь удален' : 'Система');
    return `<tr><td class="audit-when">${escape(time(item.createdAt))}</td><td>${escape(userName)}${item.userLogin && item.userName && item.userLogin !== item.userName ? `<small class="audit-login">${escape(item.userLogin)}</small>` : ''}</td><td>${escape(actions[item.action] || 'Действие в системе')}</td><td>${escape(place(item))}</td><td>${content}</td></tr>`;
  }
  async dispose() { this.disposed = true; this.request++; }
}
