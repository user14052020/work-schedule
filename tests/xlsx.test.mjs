import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { initialState, clone, dayPay, dayHours } from '../public/model.js';
import { buildWorkbook } from '../public/xlsx-export.js';

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

const baselineState = initialState();
const baseline = roundTrip(baselineState);

function dayLocations(state) {
  let row = 3;
  return state.days.map(day => {
    const result = { day, dateRow: row, rosterRow: row + 2, statusRow: row + 3, firstJobRow: row + 4 };
    row += 4 + day.rows.length;
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

test('XLSX retains all thirty dated shifts, numeric totals, and leave status on an empty day', async () => {
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
  assert.ok(dictionaryValues.includes(11500));
});

test('XLSX snapshot keeps manual values, collapsed days and formula-looking text as literal strings', async () => {
  const state = initialState();
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
