import {api,query} from './api-client.js';
import {state,formatDate,number} from './state.js';
import {escape,pageHeading,loading,safeLink} from './ui.js';
import {ViewLifecycle} from './view-lifecycle.js';
import {ColumnResizer} from './column-resize.js';

const columns = [
  ['date','Дата'],['brigade','Бригада'],['lead','Бригадир'],['partner','Осн. напарник'],
  ['extra1','Доп. №1 напарник'],['extra2','Доп. №2 напарник'],['invoice','Счет'],
  ['adjustment','Штрафы / премии'],['article','Артикул'],['type','Вид'],['hours','Часов на бригаду'],
  ['object','Объект'],['phone','Телефон работ'],['objectNotes','Примечания по объекту'],
  ['task','ТЗ на работы'],['notes','Примечания по работам / доп. ТЗ'],['tech','Техбаза'],
].map(([key,label]) => ({key,label}));
export class SearchView {
  constructor(container) {
    this.container = container; this.page = 1; this.lifecycle = new ViewLifecycle();
    this.widthPreferencePrefix = `search.width.${state.user.id}.`;
  }
  columnWidth(column) {
    const saved = Number(state.preference(this.widthPreferencePrefix + column.key));
    return Number.isFinite(saved) && saved > 0 ? Math.max(45,Math.min(800,saved)) : 2600 / columns.length;
  }
  resizeHandle(column,heading = false) {
    const attributes = heading
      ? `title="Изменить ширину столбца" tabindex="0" role="separator" aria-label="Ширина столбца ${escape(column.label)}" aria-orientation="vertical" aria-valuemin="45" aria-valuemax="800" aria-valuenow="${Math.round(this.columnWidth(column))}"`
      : 'aria-hidden="true"';
    return `<span class="column-resizer" data-resize="${column.key}" ${attributes}></span>`;
  }
  disposeResizer() { this.columnResizer?.dispose(); this.columnResizer = null; }
  async mount() {
    this.container.innerHTML = pageHeading('Поиск по графикам','Поиск по всем бригадам и годам с учетом вашего доступа.') + '<form class="search-form"><label>Искать по<select name="field"><option value="article">Артикулу</option><option value="object">Объекту</option></select></label><label class="search-query">Запрос<input name="q" required placeholder="Артикул или название объекта" autocomplete="off"></label><button class="primary" type="submit">Найти</button></form><div data-results class="search-results"><p class="empty-state">Введите запрос, чтобы найти работы.</p></div>';
    this.container.querySelector('form').onsubmit = event => { event.preventDefault(); this.page = 1; this.search(); };
  }
  async search() {
    if (this.lifecycle.disposed) return;
    const request = this.lifecycle.begin(), page = this.page;
    this.disposeResizer();
    const target = this.container.querySelector('[data-results]'); const form = this.container.querySelector('form'); const data = new FormData(form); loading(target,'Поиск по графикам…');
    try {
      const result = await api.get(`/search?${query({q:data.get('q'),field:data.get('field'),page,limit:50})}`,{signal:request.signal});
      if (!request.current() || !target.isConnected) return;
      target.innerHTML = `<p class="muted">Найдено: ${result.total || 0}</p><div class="data-table-scroll"><table class="data-table search-table"><colgroup>${columns.map(column => `<col data-width="${column.key}" style="width:${this.columnWidth(column)}px">`).join('')}</colgroup><thead><tr>${columns.map(column => `<th data-heading="${column.key}">${column.label}${this.resizeHandle(column,true)}</th>`).join('')}</tr></thead><tbody>${(result.items || []).map(item => this.row(item)).join('')}</tbody></table></div>${!result.items?.length ? '<p class="empty-state">Совпадений не найдено.</p>' : ''}<div class="pagination"><button class="button" data-prev ${this.page <= 1 ? 'disabled' : ''}>← Назад</button><span>Страница ${this.page}</span><button class="button" data-next ${this.page * 50 >= result.total ? 'disabled' : ''}>Далее →</button></div>`;
      this.columnResizer = new ColumnResizer(target.querySelector('.search-table'),{
        savedWidth:key => state.preference(this.widthPreferencePrefix + key),
        saveWidth:(key,width) => state.preference(this.widthPreferencePrefix + key,width),
        fitToContainer:false,
        onResize:() => {},
      });
      target.querySelector('[data-prev]').onclick = () => { this.page--; this.search(); }; target.querySelector('[data-next]').onclick = () => { this.page++; this.search(); };
    } catch(error) { if (request.current() && target.isConnected && error.name !== 'AbortError') target.innerHTML = `<p class="error">${escape(error.message)}</p>`; }
  }
  row(item) {
    const job = item.job || item; const shift = item.shift || item;
    const values = [formatDate(shift.date),item.brigadeCode || state.brigadeName(shift.brigadeId),...[0,1,2,3].map(slot => state.employeeName(job.people?.[slot] ?? shift.roster?.[slot])),job.invoice,number(shift.adjustment),job.objectId,job.type,number(job.hours),job.object,job.phone,job.objectNotes,job.task,job.notes];
    const cells = values.map((value,index) => {
      const extra = index === 11 ? job.objectExtra : index === 15 ? job.notesExtra : '';
      const className = index === 11 ? 'object-extra' : 'notes-extra';
      return `<td>${extra ? `<div>${escape(value)}</div><div class="${className}">${escape(extra)}</div>` : escape(value)}${this.resizeHandle(columns[index])}</td>`;
    });
    return `<tr>${cells.join('')}<td>${[job.tech,job.tech2].filter(Boolean).map(value => safeLink(value) ? `<a href="${escape(safeLink(value))}" target="_blank" rel="noopener noreferrer">${escape(value)}</a>` : escape(value)).join('<br>')}${this.resizeHandle(columns[16])}</td></tr>`;
  }
  async dispose() { this.lifecycle.dispose(); this.disposeResizer(); }
}
