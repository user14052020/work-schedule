import {api,query} from './api-client.js';
import {toast} from './ui.js';
import {WorkbookLayout} from './export-layout.js';
import {ScheduleExport} from './export-schedule.js';
import {ReferenceExport} from './export-references.js';

let preparing = false, library;
function loadLibrary() {
  if (globalThis.ExcelJS) return Promise.resolve(globalThis.ExcelJS);
  return library ||= new Promise((resolve,reject) => {
    const script = document.createElement('script'); script.src = new URL('./vendor/exceljs.min.js',import.meta.url).href;
    script.onload = () => globalThis.ExcelJS ? resolve(globalThis.ExcelJS) : reject(new Error('Не удалось загрузить библиотеку XLSX.'));
    script.onerror = () => { library = null; script.remove(); reject(new Error('Не удалось загрузить библиотеку XLSX.')); }; document.head.append(script);
  });
}
export async function createWorkbook(ExcelJS,template,references,schedules,vacations,year,today) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'CRM Demo'; workbook.created = new Date(); workbook.calcProperties.fullCalcOnLoad = true;
  const writer = new WorkbookLayout(workbook,template), schedule = new ScheduleExport(writer,references,today);
  for (const brigade of references.brigades || []) {
    const safeName = String(brigade.code || brigade.label || 'Бригада').replace(/[\\/*?:\[\]]/g,' ').slice(0,31); let name = safeName, suffix = 2;
    while (workbook.getWorksheet(name)) name = `${safeName.slice(0,27)} ${suffix++}`;
    schedule.write(name,schedules.get(brigade.id) || []);
    await new Promise(resolve => setTimeout(resolve,0));
  }
  const directories = new ReferenceExport(writer,references); directories.employeesSheet(); directories.referencesSheet(); directories.vacationsSheet(vacations,year);
  return workbook;
}
export async function exportWorkbook(parameters) {
  if (preparing) { toast('Выгрузка уже готовится.'); return; }
  preparing = true; toast('Подготовка выгрузки XLSX…');
  try {
    const [ExcelJS,bootstrap,response] = await Promise.all([loadLibrary(),api.get('/bootstrap'),fetch(new URL('./workbook-template.json',import.meta.url))]);
    if (!response.ok) throw new Error('Не удалось загрузить шаблон XLSX.');
    const template = await response.json(), year = Number(parameters.scope === 'all' ? parameters.year : parameters.period.slice(0,4));
    const periods = parameters.scope === 'all' ? Array.from({length:12},(_,index) => `${year}-${String(index + 1).padStart(2,'0')}`) : [parameters.period];
    const schedules = new Map();
    for (const brigade of bootstrap.references.brigades || []) {
      const months = [];
      for (const period of periods) months.push(await api.get(`/schedules?${query({brigadeId:brigade.id,period})}`));
      schedules.set(brigade.id,months);
    }
    const vacationResult = await api.get(`/vacations?${query({year})}`);
    const vacations = Array.isArray(vacationResult) ? vacationResult : vacationResult.items || vacationResult.vacations || [];
    const workbook = await createWorkbook(ExcelJS,template,bootstrap.references,schedules,vacations,year,bootstrap.currentDate);
    const buffer = await workbook.xlsx.writeBuffer(), filename = `crm-${parameters.scope === 'all' ? year : parameters.period}.xlsx`;
    const url = URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),60000);
    toast('Файл XLSX подготовлен. Начинается скачивание.');
  } finally { preparing = false; }
}
