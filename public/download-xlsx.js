import { brigadeName } from './model.js?v=brigades-1';

let excelPromise;

function loadExcel() {
  if (globalThis.ExcelJS) return Promise.resolve(globalThis.ExcelJS);
  if (!excelPromise) {
    excelPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./vendor/exceljs-4.4.0.min.js', import.meta.url).href;
      script.onload = () => globalThis.ExcelJS ? resolve(globalThis.ExcelJS) : reject(new Error('Не удалось загрузить модуль Excel.'));
      script.onerror = () => { excelPromise = null; script.remove(); reject(new Error('Модуль Excel не загрузился. Проверьте соединение и повторите экспорт.')); };
      document.head.append(script);
    });
  }
  return excelPromise;
}

export function xlsxFilename(state) {
  const period = state.period || state.days[0]?.date.slice(0,7) || '';
  return `График-${brigadeName(state)}-${period}.xlsx`.replace(/[<>:"/\\|?*\u0000-\u001F]/g,'-');
}

export async function downloadXlsx(state) {
  const [ExcelJS, { buildWorkbook }] = await Promise.all([loadExcel(), import('./xlsx-export.js?v=brigades-1')]);
  const workbook = buildWorkbook(state, ExcelJS);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = xlsxFilename(state);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
