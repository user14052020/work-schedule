import { employeeHours, uid } from './model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const decimal = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value || 0);
const semanticCodes = {workTypes: ['ПРЗД'], statuses: ['РД', 'ДЕЖ', 'ОТП'], invoices: ['НЕТ']};
const attributes = (kind, id, field) => `data-menu-kind="${esc(kind)}" data-menu-id="${esc(id)}" data-menu-field="${esc(field)}"`;

function input(kind, id, field, value, label, options = {}) {
  const attr = attributes(kind, id, field);
  if (options.multiline) return `<textarea ${attr} rows="2" maxlength="5000" aria-label="${esc(label)}">${esc(value)}</textarea>`;
  return `<input ${attr} type="${options.type || 'text'}" value="${esc(value)}" aria-label="${esc(label)}" ${options.type === 'number' ? 'min="0" step="any"' : 'maxlength="5000"'} ${options.placeholder ? `placeholder="${esc(options.placeholder)}"` : ''}>`;
}

function checkbox(kind, id, field, checked, label) {
  return `<label class="directory-check"><input ${attributes(kind,id,field)} type="checkbox" ${checked ? 'checked' : ''} aria-label="${esc(label)}"><span>${checked ? 'Да' : 'Нет'}</span></label>`;
}

function select(kind, id, field, value, choices, label) {
  const known = choices.some(choice => (typeof choice === 'string' ? choice : choice.code) === value);
  const entries = value && !known ? [value, ...choices] : choices;
  return `<select ${attributes(kind,id,field)} aria-label="${esc(label)}"><option value="">—</option>${entries.map(choice => {
    const code = typeof choice === 'string' ? choice : choice.code;
    const name = typeof choice === 'string' ? choice : choice.label;
    return `<option value="${esc(code)}" ${value === code ? 'selected' : ''}>${esc(name || code)}</option>`;
  }).join('')}</select>`;
}

function panel(title, subtitle, content, action, actionText) {
  return `<section class="directory-panel"><div class="directory-panel-heading"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${action ? `<button type="button" class="directory-add" data-menu-action="${action}">${esc(actionText)}</button>` : ''}</div>${content}</section>`;
}

function table(headings, rows, className = '') {
  return `<div class="directory-table-scroll"><table class="directory-table ${className}"><thead><tr>${headings.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headings.length}" class="directory-empty">Пока нет записей.</td></tr>`}</tbody></table></div>`;
}

function periodLabel(state) {
  const date = state.days?.[0]?.date;
  return date ? new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`)) : 'текущий период';
}

function employeesPage(state) {
  const employees = state.employees || [];
  const active = employees.filter(employee => employee.active).length;
  const rows = employees.map((employee,index) => `<tr class="${employee.active ? '' : 'directory-inactive'}">
    <td class="directory-index">${index + 1}</td>
    <td>${input('employees',employee.id,'fullName',employee.fullName || '',`ФИ сотрудника ${index + 1}`)}</td>
    <td>${input('employees',employee.id,'name',employee.name,`Короткое имя сотрудника ${index + 1}`)}</td>
    <td>${select('employees',employee.id,'group',employee.group,state.groups || ['Поля','Офис'],`Группа ${employee.name}`)}</td>
    <td>${select('employees',employee.id,'position',employee.position || '',state.positions || [],`Должность ${employee.name}`)}</td>
    <td>${checkbox('employees',employee.id,'driver',employee.driver,`Водитель ${employee.name}`)}</td>
    <td>${checkbox('employees',employee.id,'active',employee.active,`Активен ${employee.name}`)}</td>
    <td class="directory-hours">${decimal(employeeHours(state,employee.id))}<span>ч</span></td>
  </tr>`);
  return `<div class="directory"><header class="directory-heading"><div><div class="directory-eyebrow">КОМАНДА</div><h1>Сотрудники</h1><p>Общий список для состава бригады и каждой смены.</p></div><div class="directory-counter"><strong>${employees.length}</strong><span>сотрудников · ${active} активных</span></div></header>
    ${panel('Состав команды',`Часы за ${periodLabel(state)} рассчитаны по участию в работах. Изменения сохраняются после выхода из ячейки.`,table(['№','ФИ','Имя Ф.','Группа','Должность','Водитель','Активен','Часы за период'],rows,'directory-employees'),'add-employee','+ Сотрудник')}
    <p class="directory-footnote">В график можно назначить активных сотрудников группы «Поля». Отключение активности убирает сотрудника из новых назначений, сохраняя его историю. Это список сотрудников демо, управление доступом появится в рабочей версии.</p>
  </div>`;
}

function codeRows(kind, entries) {
  return entries.map((entry,index)=>`<tr><td class="directory-index">${index + 1}</td><td>${input(kind,entry.code,'code',entry.code,`Код ${entry.code}`)}</td><td>${input(kind,entry.code,'label',entry.label,`Пояснение ${entry.code}`)}</td></tr>`);
}

function dictionariesPage(state) {
  const types = panel('Виды работ','Коды используются в заданиях и статистике часов.',table(['№','Вид','Примечание'],codeRows('workTypes',state.workTypes || [])),'add-type','+ Вид работы');
  const statuses = panel('Статусы сотрудников','РД и ДЕЖ автоматически включают сотрудника в задания смены.',table(['№','Статус','Пояснение'],codeRows('statuses',state.statuses || [])),'add-status','+ Статус');
  const invoices = panel('Счёт','НЕТ — значение по умолчанию. Для переезда счёт пустой.',table(['№','Счёт'],(state.invoiceStates || ['ДА','ОК','НЕТ']).map((value,index)=>`<tr><td class="directory-index">${index + 1}</td><td>${input('invoices',index,'code',value,`Статус счёта ${index + 1}`)}</td></tr>`)));
  const positions = panel('Должности','Используются в карточках сотрудников.',table(['№','Должность','Описание','Условия'],(state.positions || []).map((position,index)=>`<tr><td class="directory-index">${index + 1}</td><td>${input('positions',position.code,'code',position.code,`Должность ${index + 1}`)}</td><td>${input('positions',position.code,'description',position.description || '',`Описание должности ${position.code}`,{multiline:true})}</td><td>${input('positions',position.code,'terms',position.terms || '',`Условия должности ${position.code}`,{multiline:true})}</td></tr>`)),'add-position','+ Должность');
  const rates = panel('Ставки за смену','Базовые ставки, ₽. Доплаты бригадиру и правила обучения в демо не рассчитываются.',table(['Часы работы','До, ч','Не водитель, ₽','Водитель, ₽'],(state.rates || []).map(rate=>`<tr><td>${input('rates',rate.id,'label',rate.label,`Период ставки ${rate.label}`)}</td><td>${input('rates',rate.id,'maxHours',rate.maxHours,`Верхняя граница часов ${rate.label}`,{type:'number',placeholder:'—'})}</td><td>${input('rates',rate.id,'nonDriver',rate.nonDriver,`Ставка не водителя ${rate.label}`,{type:'number'})}</td><td>${input('rates',rate.id,'driver',rate.driver,`Ставка водителя ${rate.label}`,{type:'number'})}</td></tr>`)));
  const objects = panel('Объекты','При выборе номера в графике подставляются объект, контакт, примечание, ТЗ и техбаза. Ручные дополнения в графике сохраняются.',table(['№ объекта','Объект','Телефон работ','Примечания по объекту','ТЗ на работы','Техбаза'],(state.objects || []).map(object=>`<tr><td>${input('objects',object.id,'id',object.id,`Номер объекта ${object.id}`)}</td><td>${input('objects',object.id,'name',object.name,`Название объекта ${object.id}`,{multiline:true})}</td><td>${input('objects',object.id,'phone',object.phone,`Телефон объекта ${object.id}`,{multiline:true})}</td><td>${input('objects',object.id,'notes',object.notes,`Примечания объекта ${object.id}`,{multiline:true})}</td><td>${input('objects',object.id,'task',object.task,`ТЗ объекта ${object.id}`,{multiline:true})}</td><td>${input('objects',object.id,'tech',object.tech,`Техбаза объекта ${object.id}`,{placeholder:'https://…'})}</td></tr>`),'directory-objects'),'add-object','+ Объект');
  return `<div class="directory"><header class="directory-heading"><div><div class="directory-eyebrow">ОБЩИЕ ДАННЫЕ</div><h1>Справочники</h1><p>Единые значения для графика и сотрудников. Изменения сохраняются после выхода из ячейки.</p></div></header><div class="directory-grid">${types}${statuses}${invoices}</div>${positions}${rates}${objects}<p class="directory-footnote">Код или номер, который уже используется, переименовать нельзя. Пояснения можно менять. Служебные коды ПРЗД, РД, ДЕЖ, ОТП и НЕТ закреплены за правилами графика.</p></div>`;
}

export function renderMenu(state, view) {
  if (view === 'employees') return employeesPage(state);
  if (view === 'dictionaries') return dictionariesPage(state);
  return '';
}

function clean(value, label, required = false, max = 5000) {
  const result = String(value ?? '').trim();
  if (required && !result) throw Error(`${label}: заполните значение.`);
  if (result.length > max) throw Error(`${label}: не более ${max} символов.`);
  return result;
}

function unique(entries, value, current, field, label) {
  if (entries.some(entry => entry !== current && String(entry[field] || '').trim().toLocaleLowerCase('ru-RU') === value.toLocaleLowerCase('ru-RU'))) throw Error(`${label} «${value}» уже существует.`);
}

function employeeAssigned(state,id) {
  return (state.roster || []).includes(id) || (state.days || []).some(day => day.roster.includes(id) || day.rows.some(row => row.people.includes(id)));
}

function codeReferenced(state,kind,code) {
  if (kind === 'workTypes') return state.days.some(day => day.rows.some(row => row.type === code));
  if (kind === 'statuses') return state.days.some(day => day.statuses.includes(code));
  if (kind === 'positions') return state.employees.some(employee => employee.position === code);
  if (kind === 'invoices') return state.days.some(day => day.rows.some(row => row.invoice === code));
  return false;
}

function validateCodeChange(state,kind,oldCode,newCode) {
  if (oldCode === newCode) return;
  if ((semanticCodes[kind] || []).includes(oldCode)) throw Error(`Код «${oldCode}» используется правилами графика и не переименовывается.`);
  if (codeReferenced(state,kind,oldCode)) throw Error(`«${oldCode}» уже используется. Можно изменить пояснение или добавить новую запись.`);
}

function amount(value,label,nullable = false) {
  const text = String(value ?? '').trim();
  if (!text && nullable) return null;
  const number = Number(text.replace(',','.'));
  if (!text || !Number.isFinite(number) || number < 0 || number > 10000000) throw Error(`${label}: введите число от 0 до 10 000 000.`);
  return number;
}

export function handleMenuChange(state, target) {
  const { menuKind: kind, menuId: id, menuField: field } = target.dataset || {};
  if (!kind || !field) return false;
  if (kind === 'employees') {
    const employee = state.employees.find(entry => entry.id === id);
    if (!employee) throw Error('Сотрудник не найден.');
    if (field === 'active' || field === 'driver') { employee[field] = Boolean(target.checked); return true; }
    if (!['fullName','name','group','position'].includes(field)) throw Error('Неизвестное поле сотрудника.');
    const value = clean(target.value,field === 'name' ? 'Короткое имя' : 'Значение',field === 'name' || field === 'group',150);
    if (field === 'name') unique(state.employees,value,employee,'name','Имя');
    if (field === 'fullName' && value) unique(state.employees,value,employee,'fullName','ФИ');
    if (field === 'group') {
      if (!(state.groups || ['Поля','Офис']).includes(value)) throw Error('Выберите группу из списка.');
      if (employee.group === 'Поля' && value !== 'Поля' && employeeAssigned(state,id)) throw Error('Сотрудник назначен в график. Сначала уберите его из состава бригады и смен.');
    }
    if (field === 'position' && value && !(state.positions || []).some(position => position.code === value)) throw Error('Выберите должность из справочника.');
    employee[field] = value;
    return true;
  }
  if (['workTypes','statuses','positions'].includes(kind)) {
    const entries = state[kind] || [];
    const entry = entries.find(item => item.code === id);
    if (!entry) throw Error('Запись справочника не найдена.');
    const allowed = kind === 'positions' ? ['code','description','terms'] : ['code','label'];
    if (!allowed.includes(field)) throw Error('Неизвестное поле справочника.');
    const value = clean(target.value,'Значение',field === 'code',field === 'code' ? 150 : 5000);
    if (field === 'code') {
      validateCodeChange(state,kind,entry.code,value);
      unique(entries,value,entry,'code','Код');
      if (kind === 'positions') entry.label = value;
    }
    if (field === 'label' && value) unique(entries,value,entry,'label','Название');
    entry[field] = value;
    return true;
  }
  if (kind === 'invoices') {
    if (field !== 'code') throw Error('Неизвестное поле счёта.');
    const index = Number(id), entries = state.invoiceStates || ['ДА','ОК','НЕТ'];
    if (!Number.isInteger(index) || index < 0 || index >= entries.length) throw Error('Статус счёта не найден.');
    const value = clean(target.value,'Статус счёта',true,50);
    validateCodeChange(state,kind,entries[index],value);
    if (entries.some((entry,i)=>i !== index && entry.toLocaleLowerCase('ru-RU') === value.toLocaleLowerCase('ru-RU'))) throw Error('Такой статус счёта уже существует.');
    state.invoiceStates = entries.map((entry,i)=>i === index ? value : entry);
    return true;
  }
  if (kind === 'rates') {
    const rate = (state.rates || []).find(entry => String(entry.id) === id);
    if (!rate) throw Error('Ставка не найдена.');
    if (field === 'label') { rate.label = clean(target.value,'Часы работы',true,150); return true; }
    if (!['nonDriver','driver','maxHours'].includes(field)) throw Error('Неизвестное поле ставки.');
    const value = amount(target.value,'Ставка',field === 'maxHours');
    if (field === 'maxHours') {
      if (value !== null && value > 24) throw Error('Верхняя граница: не более 24 часов.');
      const before = rate.maxHours;
      if ((before === null || before === undefined) && value !== null) throw Error('У отпуска и открытого интервала нет верхней границы часов.');
      if (before !== null && before !== undefined && value === null) throw Error('Укажите верхнюю границу интервала.');
      const finite = state.rates.filter(entry => entry.maxHours !== null && entry.maxHours !== undefined);
      const index = finite.indexOf(rate);
      if (value !== null && ((index > 0 && value <= finite[index-1].maxHours) || (index < finite.length-1 && value >= finite[index+1].maxHours))) throw Error('Границы часов должны возрастать от строки к строке.');
      if (before === 0 && value !== 0) throw Error('Нулевая смена должна сохранять границу 0 часов.');
    }
    rate[field] = value;
    return true;
  }
  if (kind === 'objects') {
    const object = state.objects.find(entry=>entry.id === id);
    if (!object) throw Error('Объект не найден.');
    if (!['id','name','phone','notes','task','tech'].includes(field)) throw Error('Неизвестное поле объекта.');
    const value = clean(target.value,'Значение',field === 'id' || field === 'name',field === 'id' ? 50 : 5000);
    if (field === 'id') {
      unique(state.objects,value,object,'id','Номер объекта');
      if (value !== id && state.days.some(day=>day.rows.some(row=>row.objectId === id))) throw Error('Номер уже используется в графике. Название и остальные данные можно изменить.');
    }
    if (field === 'name') unique(state.objects,value,object,'name','Название объекта');
    if (field === 'tech' && value) {
      let url; try { url = new URL(value); } catch { throw Error('Укажите полную ссылку http:// или https://.'); }
      if (!['http:','https:'].includes(url.protocol)) throw Error('Ссылка должна начинаться с http:// или https://.');
    }
    const oldValue = object[field];
    object[field] = value;
    const rowField = {name:'object',phone:'phone',notes:'objectNotes',task:'task',tech:'tech'}[field];
    if (rowField) for (const day of state.days) for (const row of day.rows) if (row.objectId === id && row[rowField] === oldValue) row[rowField] = value;
    return true;
  }
  throw Error('Неизвестный справочник.');
}

function nextCode(entries,prefix,field = 'code') {
  let index = 1;
  while (entries.some(entry=>String(entry[field]).toLocaleLowerCase('ru-RU') === `${prefix}${index}`.toLocaleLowerCase('ru-RU'))) index++;
  return `${prefix}${index}`;
}

export function handleMenuAction(state, button) {
  const action = button.dataset?.menuAction;
  if (action === 'add-employee') {
    state.employees.push({id:uid(),fullName:'',name:nextCode(state.employees,'Новый сотрудник ', 'name'),group:'Поля',position:'',driver:false,active:true});
    return true;
  }
  if (action === 'add-object') {
    let number = Math.max(100,...state.objects.map(object=>Number(object.id)).filter(Number.isFinite)) + 1;
    while (state.objects.some(object=>object.id === String(number))) number++;
    state.objects.push({id:String(number),name:nextCode(state.objects,'Новый объект ','name'),phone:'',notes:'',task:'',tech:''});
    return true;
  }
  const definition = {'add-type':['workTypes','ВИД-'],'add-status':['statuses','СТ-'],'add-position':['positions','Новая должность ']}[action];
  if (!definition) return false;
  const [kind,prefix] = definition;
  if (!state[kind]) state[kind] = [];
  const code = nextCode(state[kind],prefix);
  state[kind].push(kind === 'positions' ? {code,label:code,description:'',terms:''} : {code,label:''});
  return true;
}
