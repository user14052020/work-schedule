import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { initialState, clone, blankRow, dayPay, dayHours, monthHours, employeeHours, switchPeriod, switchBrigade } from '../public/model.js';
import { buildWorkbook } from '../public/xlsx-export.js';
import { xlsxFilename } from '../public/download-xlsx.js';

// Execute the same vendored browser bundle that the page downloads, without a DOM.
const browserModule = { exports: {} };
const sandbox = {
  module: browserModule, exports: browserModule.exports, console, Buffer, Date,
  ArrayBuffer, Uint8Array, Uint16Array, Uint32Array, DataView, Blob, URL,
  TextEncoder, TextDecoder, setTimeout, clearTimeout, setImmediate, clearImmediate,
};
vm.runInNewContext(await readFile(new URL('../public/vendor/exceljs-4.4.0.min.js', import.meta.url), 'utf8'), sandbox, { filename: 'exceljs-browser.js' });
const ExcelJS = browserModule.exports;
const SCHEDULE_NAME = 'Б1 + Бригадир + Осн Напарник';

async function roundTrip(state) {
  const before = clone(state);
  const generated = await buildWorkbook(state, ExcelJS);
  const bytes = await generated.xlsx.writeBuffer();
  assert.deepEqual(state, before, 'export must not alter browser data');
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  return { workbook, bytes };
}

// A small, explicit source-example fixture keeps the known 21.5-hour totals
// independent of the additional filled demonstration months.
function sourceExample() {
  const state = initialState();
  switchPeriod(state, '2026-09');
  state.days = state.days.slice(0, 3);
  Object.assign(state.days[2], {
    roster: ['e1', 'e2', '', '', ''], statuses: ['ОТП', 'Б2', '', '', ''],
    pay: null, adjustment: null, hoursOverride: null, rows: Array.from({ length: 5 }, blankRow),
  });
  return state;
}

const baselineState = sourceExample();
const baseline = roundTrip(baselineState);

function dayLocations(state) {
  let row = 3;
  return state.days.map(day => {
    const result = { day, dateRow: row, rosterRow: row + 2, statusRow: row + 3, firstJobRow: row + 4 };
    row += 4 + Math.max(1, day.rows.length);
    return result;
  });
}

function allCellValues(sheet) {
  const values = [];
  sheet.eachRow(row => row.eachCell(cell => values.push(cell.value)));
  return values;
}

test('XLSX browser export round-trips as a real workbook with three useful sheets', async () => {
  const { workbook, bytes } = await baseline;
  assert.ok(bytes.length > 1000);
  assert.deepEqual(Array.from(workbook.worksheets, sheet => sheet.name), [SCHEDULE_NAME, 'Сотрудники', 'Справочники']);
  assert.equal(workbook.getWorksheet(SCHEDULE_NAME).getCell('J1').value, 21.5);
  assert.equal(typeof workbook.getWorksheet(SCHEDULE_NAME).getCell('J1').value, 'number');
});

test('XLSX retains every fixture shift, numeric totals, and leave status on an empty day', async () => {
  const { workbook } = await baseline;
  const sheet = workbook.getWorksheet(SCHEDULE_NAME);
  for (const { day, dateRow, firstJobRow } of dayLocations(baselineState)) {
    const date = sheet.getCell(`C${dateRow}`).value;
    assert.ok(date instanceof Date, `${day.date} must be an Excel date`);
    assert.equal(date.toISOString().slice(0, 10), day.date);
    assert.equal(sheet.getCell(`H${firstJobRow}`).value, dayPay(baselineState, day), `${day.date} pay`);
    assert.equal(sheet.getCell(`J${firstJobRow}`).value, dayHours(day), `${day.date} hours`);
  }
  assert.equal(sheet.getCell('C26').value, 'ОТП');
  assert.equal(sheet.getCell('D26').value, 'Б2');
  assert.equal(sheet.getCell('H27').value, 1500);
  assert.equal(sheet.getCell('J27').value, 0);
  assert.equal(sheet.getCell('M7').value, 0.5);
});

test('XLSX preserves combined shift totals, distinct role colors and frozen table headers', async () => {
  const { workbook } = await baseline;
  const sheet = workbook.getWorksheet(SCHEDULE_NAME);
  assert.equal(sheet.getCell('H13').master.address, 'H7');
  assert.equal(sheet.getCell('I13').master.address, 'I7');
  assert.equal(sheet.getCell('J13').master.address, 'J7');
  assert.equal(sheet.getCell('H22').master.address, 'H18');
  const view = sheet.views.find(item => item.state === 'frozen');
  assert.ok(view);
  assert.equal(view.ySplit, 2);
  assert.equal(view.xSplit, 2);
  assert.ok(sheet.getRow(7).outlineLevel > 0);
  const colors = ['C7', 'D7', 'E7'].map(address => sheet.getCell(address).fill?.fgColor?.argb);
  assert.ok(colors.every(Boolean));
  assert.ok(new Set(colors).size >= 2, 'role styling must remain distinguishable');
});

test('XLSX includes employees and editable dictionaries with employee hours and base rates', async () => {
  const { workbook } = await baseline;
  const staff = workbook.getWorksheet('Сотрудники'), dictionaries = workbook.getWorksheet('Справочники');
  assert.equal(staff.getCell('H5').value, 21.5);
  const staffValues = allCellValues(staff), dictionaryValues = allCellValues(dictionaries);
  for (const employee of baselineState.employees) assert.ok(staffValues.includes(employee.name), employee.name);
  for (const type of baselineState.workTypes) assert.ok(dictionaryValues.includes(type.code), type.code);
  for (const status of baselineState.statuses) assert.ok(dictionaryValues.includes(status.code), status.code);
  for (const object of baselineState.objects) assert.ok(dictionaryValues.includes(object.name), object.name);
  assert.ok(dictionaryValues.includes('Бригады'));
  for (const brigade of baselineState.brigades) {
    assert.ok(dictionaryValues.includes(brigade.code), brigade.code);
    assert.ok(dictionaryValues.includes(brigade.label), brigade.label);
  }
  assert.ok(dictionaryValues.includes(11500));
});

test('XLSX snapshot keeps manual values, collapsed days and formula-looking text as literal strings', async () => {
  const state = sourceExample();
  state.days[0].pay = 12345;
  state.days[0].hoursOverride = 7.25;
  state.days[2].pay = 4321;
  state.days[2].adjustment = -500;
  state.days[2].hoursOverride = 0;
  state.collapsedDays = ['2026-09-03'];
  const strings = ['=HYPERLINK("https://example.invalid","текст")', '+SUM(A1)', '-1+2', '@SUM(A1)', 'Строка 1\nСтрока 2'];
  [state.days[0].rows[0].object, state.days[0].rows[0].phone, state.days[0].rows[0].objectNotes, state.days[0].rows[0].task, state.days[0].rows[0].notes] = strings;
  const { workbook } = await roundTrip(state);
  const sheet = workbook.getWorksheet(SCHEDULE_NAME);
  assert.equal(sheet.getCell('J1').value, 17.75);
  assert.equal(sheet.getCell('H7').value, 12345);
  assert.equal(sheet.getCell('J7').value, 7.25);
  assert.equal(sheet.getCell('H27').value, 4321);
  assert.equal(sheet.getCell('I27').value, -500);
  assert.equal(sheet.getCell('J27').value, 0);
  assert.equal(sheet.getRow(27).hidden, true);
  for (const value of strings) {
    assert.ok(allCellValues(sheet).includes(value), value);
  }
  sheet.eachRow(row => row.eachCell(cell => {
    assert.equal(cell.formula, undefined, `unexpected executable formula in ${cell.address}`);
  }));
});

for (const [period, dayCount, monthName, filled] of [
  ['2026-08', 31, 'АВГУСТ', true],
  ['2026-09', 30, 'СЕНТЯБРЬ', true],
  ['2028-02', 29, 'ФЕВРАЛЬ', false],
]) {
  test(`XLSX round-trip exports only selected ${period}, all ${dayCount} calendar days and its totals`, async () => {
    const state = initialState();
    // Mark a different month to detect accidental leakage from the period cache.
    switchPeriod(state, period === '2026-09' ? '2026-08' : '2026-09');
    state.days[0].rows[0].notes = 'Другой месяц — не экспортировать';
    switchPeriod(state, period);
    assert.equal(state.period, period);
    assert.equal(state.days.length, dayCount);
    if (filled) assert.ok(state.days.every(day => day.rows.some(row => row.type && row.hours > 0)), 'every seeded day has work');
    else assert.ok(state.days.every(day => dayHours(day) === 0), 'new period starts without work');
    const expectedHours = monthHours(state);
    const { workbook } = await roundTrip(state);
    const sheet = workbook.getWorksheet(SCHEDULE_NAME);
    assert.equal(sheet.getCell('A1').value, monthName);
    assert.match(sheet.getCell('K1').value, new RegExp(period.slice(0, 4)));
    assert.match(workbook.title, new RegExp(period.slice(0, 4)));
    assert.equal(sheet.getCell('J1').value, expectedHours);
    const dates = [];
    for (const { day, dateRow, firstJobRow } of dayLocations(state)) {
      const date = sheet.getCell(`C${dateRow}`).value;
      assert.ok(date instanceof Date);
      dates.push(date.toISOString().slice(0, 10));
      assert.equal(dates.at(-1), day.date);
      assert.equal(sheet.getCell(`H${firstJobRow}`).value, dayPay(state, day));
      assert.equal(sheet.getCell(`J${firstJobRow}`).value, dayHours(day));
    }
    assert.equal(new Set(dates).size, dayCount);
    assert.equal(dates[0], `${period}-01`);
    assert.equal(dates.at(-1), `${period}-${dayCount}`);
    const exportedDates = allCellValues(sheet).filter(value => value instanceof Date).map(value => value.toISOString().slice(0, 7));
    assert.ok(exportedDates.every(value => value === period));
    assert.ok(!allCellValues(sheet).includes('Другой месяц — не экспортировать'));
    const staff = workbook.getWorksheet('Сотрудники');
    state.employees.forEach((employee, index) => assert.equal(staff.getCell(`H${index + 5}`).value, employeeHours(state, employee.id)));
  });
}

test('XLSX and download name identify selected brigade with only its schedule and employee hours', async () => {
  const state = initialState();
  state.days[0].rows[0].notes = 'Работа только первой бригады';
  switchBrigade(state, 'b2');
  state.days[0].rows[0].notes = 'Работа только второй бригады';
  const { workbook } = await roundTrip(state);
  const sheet = workbook.getWorksheet('Б2 + Бригадир + Осн Напарник');
  assert.ok(sheet);
  assert.equal(workbook.getWorksheet(SCHEDULE_NAME), undefined);
  assert.equal(xlsxFilename(state), `График-Б2-${state.period}.xlsx`);
  assert.match(workbook.title, /^График Б2 — /);
  assert.match(sheet.getCell('K1').value, /^Б2 · /);
  assert.equal(sheet.getCell('J1').value, monthHours(state));
  const values = allCellValues(sheet);
  assert.ok(values.includes('Работа только второй бригады'));
  assert.ok(!values.includes('Работа только первой бригады'));
  const staff = workbook.getWorksheet('Сотрудники');
  assert.match(staff.getCell('A2').value, /бригад[аы] «Б2»/i);
  assert.match(staff.getCell('A2').value, /2026/);
  assert.equal(staff.getCell('H4').value, 'Часы выбранной бригады');
  state.employees.forEach((employee,index)=>assert.equal(staff.getCell(`H${index+5}`).value,employeeHours(state,employee.id)));
  const dictionaryValues = allCellValues(workbook.getWorksheet('Справочники'));
  for (const brigade of state.brigades) assert.ok(dictionaryValues.includes(brigade.code));
});

test('renamed brigade codes survive export while worksheet and file names remain valid', async () => {
  const state = sourceExample();
  const code = "'/Выезд:№2?[Москва]*\\";
  state.brigades.find(brigade=>brigade.id === state.brigadeId).code = code;
  const { workbook } = await roundTrip(state);
  const sheet = workbook.worksheets[0];
  assert.ok(sheet.name.length <= 31);
  assert.doesNotMatch(sheet.name, /[\\/*?:\[\]]|^'|'$/);
  assert.doesNotMatch(xlsxFilename(state), /[<>:"/\\|?*\u0000-\u001F]/);
  assert.ok(workbook.title.includes(code));
  assert.ok(sheet.getCell('K1').value.startsWith(`${code} · `));
  assert.ok(allCellValues(workbook.getWorksheet('Справочники')).includes(code));
});
