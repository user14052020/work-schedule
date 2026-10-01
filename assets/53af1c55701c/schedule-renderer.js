import {state,formatDate,number} from './state.js';
import {escape,options,safeColor} from './ui.js';
import {MAX_WORK_ROWS,extraTextFields,hasWorkContent} from './schedule-model.js';

function cellResizeHandle(column) {
  return `<span class="column-resizer" data-resize="${escape(column.key)}" title="Изменить ширину столбца" aria-hidden="true"></span>`;
}

export function renderDay(view,day) {
    const open = view.expanded.has(day.date);
    const weekday = new Date(`${day.date}T12:00:00`).toLocaleDateString('ru-RU',{weekday:'short'}).toUpperCase();
    const current = day.date === state.currentDate;
    const available = Math.max(0,MAX_WORK_ROWS - day.rows.length);
    const hours = view.personal ? day.hours : day.calculated?.hours;
    return `<tr class="date-row ${current ? 'today' : ''}" data-date="${escape(day.date)}" data-day-id="${escape(day.id)}"><td colspan="${view.visible.length}"><div class="date-sticky"><button class="icon-button" data-toggle="${escape(day.date)}" aria-expanded="${open}" aria-label="${open ? 'Свернуть' : 'Развернуть'} ${formatDate(day.date)}">${open ? '▾' : '▸'}</button><span class="date-number">${day.date.slice(-2)}</span><span class="date-weekday">${weekday}</span>${current ? '<span class="badge">Сегодня</span>' : ''}${view.personal ? `<span>${escape(state.brigadeName(day.brigadeId))}</span>` : ''}<span class="date-summary" data-day-summary="${escape(day.id)}">${number(hours ?? 0)} ч · ${day.rows.filter(row => row.type || row.task || row.object || row.objectExtra || row.notes || row.notesExtra).length} работ</span>${view.editable ? `<button class="day-add" data-add="${escape(day.id)}" ${available ? '' : 'disabled'} title="Не более ${MAX_WORK_ROWS} строки работ">${available === 1 ? '＋ 1 работа' : '＋ 2 работы'}</button>` : ''}</div></td></tr>${open ? view.shiftHtml(day) : ''}`;
  }
export function renderShift(view,day) {
    const cells = view.visible.map(column => {
      let content = '';
      if (column.key === 'time') content = '<span class="shift-label">СОСТАВ<br>СМЕНЫ</span>';
      const slot = {lead:0,partner:1,extra1:2,extra2:3}[column.key];
      if (slot !== undefined) content = view.rosterCell(day,slot) + (slot === 3 ? view.rosterCell(day,4) : '');
      if (column.key === 'pay') content = view.shiftInput(day,'pay',day.pay,'number', {disabled:!view.editable || !state.admin || day.everClosed || day.date.slice(0,7) < state.currentDate.slice(0,7),placeholder:day.calculated?.pay ?? '',title:'Ручная корректировка доступна администратору в новом открытом периоде'}) + `<small class="calculation" data-day-pay="${escape(day.id)}">Расчет: ${number(day.calculated?.pay)} ₽</small>`;
      if (column.key === 'adjustment') content = view.shiftInput(day,'adjustment',day.adjustment,'number', {className:Number(day.adjustment) < 0 ? 'negative' : 'positive'}) + view.shiftInput(day,'adjustmentComment',day.adjustmentComment,'textarea',{placeholder:'Комментарий к штрафу / премии'}) + (view.editable ? `<button class="text-button small" data-allocate="${escape(day.id)}">Распределить</button>` : '');
      if (column.key === 'total') content = view.shiftInput(day,'hoursOverride',day.hoursOverride,'number',{placeholder:day.calculated?.hours ?? ''}) + `<small class="calculation">Авто: ${number(day.calculated?.hours)}</small>`;
      if (view.personal && column.key === 'pay') content = day.financeVisible ? `<div class="read-value" title="Автоматический расчет по ставкам и признаку водителя">${number(day.pay)} ₽</div>` : '';
      if (view.personal && column.key === 'total') content = `<div class="read-value" title="Часы работ сотрудника за смену">${number(day.hours ?? 0)}</div>`;
    return `<td class="${column.key} ${view.personalCellClass(day,column.key)}">${content}${cellResizeHandle(column)}</td>`;
    }).join('');
    const warning = view.warningText(day);
    const visibleRows = [...day.rows];
    return `<tr class="shift-row" data-shift="${escape(day.id)}">${cells}</tr><tr class="warning-row" data-warning="${escape(day.id)}" ${warning ? '' : 'hidden'}><td colspan="${view.visible.length}">${escape(warning)}</td></tr>${visibleRows.map((row,index) => `<tr class="job-row ${index % 2 ? 'alternate' : ''}" data-shift="${escape(day.id)}" data-job="${escape(row.id)}">${view.visible.map(column => view.jobCell(day,row,column,index)).join('')}</tr>`).join('')}${!visibleRows.length ? `<tr class="empty-day"><td colspan="${view.visible.length}">Работы не назначены</td></tr>` : ''}`;
  }

export function renderJobCell(view,day,row,column,index) {
    let content = '';
    const slot = {lead:0,partner:1,extra1:2,extra2:3}[column.key];
    const attrs = `class="cell-input" data-field="${column.key}" data-column-index="${view.visible.indexOf(column)}" aria-label="${escape(column.label)}" ${view.editable ? '' : ['type','invoice'].includes(column.key) ? 'disabled' : 'readonly'}`;
    if (slot !== undefined) content = view.participantCell(day,row,slot) + (slot === 3 ? view.participantCell(day,row,4) : '');
    else if (column.key === 'type') content = `<select ${attrs}>${options(state.references.workTypes,row.type,{value:'code',label:'code'})}</select>`;
    else if (column.key === 'invoice') { const invoice = (state.references.invoiceStates || []).find(item => item.code === row.invoice); content = `<select ${attrs} style="background:${safeColor(invoice?.color)}">${options(state.references.invoiceStates,row.invoice,{value:'code',label:'code'})}</select>`; }
    else if (column.key === 'tech') content = view.techCell(row,attrs);
    else if (extraTextFields[column.key]) content = view.textCell(row,column.key,attrs);
    else if (column.key === 'time') content = `<input ${attrs} type="text" inputmode="numeric" autocomplete="off" placeholder="ЧЧ:ММ" title="Время в формате ЧЧ:ММ, от 00:00 до 23:59" value="${escape(row.time)}">`;
    else if (!['pay','adjustment','total'].includes(column.key)) content = `<textarea ${attrs} rows="1" ${column.key === 'hours' ? 'inputmode="decimal"' : ''}>\n${escape(row[column.key])}</textarea>`;
    if (column.key === 'time' && view.editable) content += `<button type="button" class="text-button small" data-remove-job="${escape(row.id)}" title="Удалить работу" aria-label="Удалить работу ${index + 1}" ${day.rows.length === 1 && !hasWorkContent(row) ? 'disabled' : ''}>×</button>`;
    return `<td class="${column.key} ${view.personalCellClass(day,column.key,row)} ${column.key === 'type' && !row.type && (row.object || row.objectExtra || row.task || row.notes || row.notesExtra || row.hours) ? 'missing' : ''}" data-cell="${column.key}">${content}${cellResizeHandle(column)}</td>`;
  }

export function replaceDayRows(table,day,html) {
  const header = [...table.querySelectorAll('.date-row')].find(row => row.dataset.dayId === day.id);
  if (!header) return [];
  let next = header.nextElementSibling;
  while (next && !next.classList.contains('date-row')) { const following = next.nextElementSibling; next.remove(); next = following; }
  const body = document.createElement('tbody'); body.innerHTML = html;
  const rows = [...body.children];
  header.replaceWith(...rows);
  return rows;
}
