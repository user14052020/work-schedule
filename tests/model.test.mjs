import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, clone, blankRow, participants, participantAt, calculatedHours,
  dayHours, monthHours, typeTotals, employeeHours, basicPay, dayPay,
  validateRoster, applyRoster, setJobField, parseTsv, applyPaste, toCsv, JOB_FIELDS,
} from '../public/model.js';
import { handleMenuChange, handleMenuAction, renderMenu } from '../public/menus.js';

const change = (state, kind, id, field, value, checked) => handleMenuChange(state, {
  dataset: { menuKind: kind, menuId: String(id), menuField: field }, value, checked,
});
const column = name => JOB_FIELDS.indexOf(name);
// The app edits a cloned candidate and commits only after validation succeeds.
const candidateEdit = (state, edit) => { const next = clone(state); edit(next); return next; };

function csvRecords(csv) {
  const records = []; let record = [], value = '', quoted = false;
  for (let i = 1; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && char === ';') { record.push(value); value = ''; }
    else if (!quoted && char === '\r' && csv[i + 1] === '\n') { record.push(value); records.push(record); record = []; value = ''; i++; }
    else value += char;
  }
  record.push(value); records.push(record); return records;
}

test('baseline totals: 21.5 hours with work types and individual participation', () => {
  const state = initialState();
  assert.equal(monthHours(state), 21.5);
  assert.equal(calculatedHours(state.days[0]), 11);
  assert.equal(calculatedHours(state.days[1]), 10.5);
  assert.deepEqual(Object.fromEntries(typeTotals(state)), { 'ЧВ': 16, 'ПРЗД': 3, 'ЖУ': 2.25, 'ОСМ': 0.25 });
  for (const [id, hours] of [['e1', 21.5], ['e2', 10.75], ['e3', 2.5], ['e4', 11], ['e5', 11], ['e6', 10.5], ['e7', 0]]) {
    assert.equal(employeeHours(state, id), hours, id);
  }
  assert.equal(dayPay(state, state.days[0]), 38500);
  assert.equal(dayPay(state, state.days[1]), 18000);
  assert.equal(dayPay(state, state.days[2]), 1500);
});

test('automatic participation requires a work type and РД/ДЕЖ; explicit opt out survives', () => {
  const state = initialState(), day = state.days[0], row = blankRow();
  assert.deepEqual(participants(day, row), []);
  row.type = 'ЧВ'; day.statuses = ['РД', 'ДЕЖ', 'ОТП', 'БЛН', 'Б2'];
  assert.deepEqual(participants(day, row), ['e1', 'e2']);
  row.people[0] = '';
  assert.equal(participantAt(day, row, 0), '');
  assert.deepEqual(participants(day, row), ['e2']);
  setJobField(state, day, row, 'person0', '__auto');
  assert.deepEqual(participants(day, row), ['e1', 'e2']);
});

test('changing a status immediately changes automatic employee hours', () => {
  const state = initialState();
  state.days[1].statuses[1] = 'ДЕЖ';
  assert.equal(employeeHours(state, 'e2'), 21.25);
  state.days[1].statuses[1] = 'ОТП';
  assert.equal(employeeHours(state, 'e2'), 10.75);
});

test('period roster replacement leaves every other day untouched and preserves unchanged roles', () => {
  const state = initialState(), before = clone(state);
  state.days[4].statuses[1] = 'ОТП';
  state.days[4].rows[0].people[1] = '';
  state.days[4].rows[0].people[0] = '';
  const count = applyRoster(state, ['e8', 'e2', '', '', ''], '2026-09-05', '2026-09-07');
  assert.equal(count, 3);
  assert.deepEqual(state.days.slice(0, 4), before.days.slice(0, 4));
  assert.deepEqual(state.days.slice(7), before.days.slice(7));
  assert.deepEqual(state.days[4].roster, ['e8', 'e2', '', '', '']);
  assert.deepEqual(state.days[4].statuses, ['РД', 'ОТП', '', '', '']);
  assert.equal(state.days[4].rows[0].people[0], null);
  assert.equal(state.days[4].rows[0].people[1], '');
});

test('invalid roster/date edits reject before mutating state', () => {
  const state = initialState(), before = clone(state);
  for (const roster of [['e1', 'e1', '', '', ''], ['e7', '', '', '', ''], ['missing', '', '', '', '']]) {
    assert.throws(() => validateRoster(state, roster));
  }
  for (const [from, to] of [['2026-08-31', '2026-09-01'], ['2026-09-30', '2026-09-31'], ['2026-09-05', '2026-09-04']]) {
    assert.throws(() => applyRoster(state, state.roster, from, to));
  }
  assert.deepEqual(state, before);
});

test('dictionary-aware paste normalizes time/decimal, fills object fields and grows rows', () => {
  const state = initialState(), day = state.days[3];
  const pasted = candidateEdit(state, next => {
    applyPaste(next, day.date, 0, column('objectId'), '101\tЧВ\t2,5');
    applyPaste(next, day.date, 1, column('time'), '9.05\tАлексей С.');
    applyPaste(next, day.date, 5, column('type'), 'ЖУ\t0,5\nПРЗД\t1');
  });
  const rows = pasted.days[3].rows;
  assert.equal(rows[0].objectId, '101');
  assert.equal(rows[0].object, state.objects[0].name);
  assert.equal(rows[0].hours, 2.5);
  assert.equal(rows[1].time, '09:05');
  assert.equal(rows[1].people[0], 'e1');
  assert.equal(rows[5].hours, 0.5);
  assert.equal(rows[6].type, 'ПРЗД');
  assert.equal(rows[6].invoice, '');
  assert.equal(state.days[3].rows.length, 5);
});

test('a late invalid paste cell cannot partially commit the cloned transaction', () => {
  const state = initialState(), before = clone(state);
  for (const [field, text] of [
    ['type', 'ЧВ\t2\nНЕИЗВЕСТНО\t3'],
    ['objectId', '101\tЧВ\t2\n999\tЖУ\t1'],
    ['person0', 'Алексей С.\tНеизвестный сотрудник'],
    ['person0', 'Елена П.\t'],
    ['hours', '1\n25'],
  ]) {
    assert.throws(() => candidateEdit(state, next => applyPaste(next, '2026-09-04', 0, column(field), text)));
    assert.deepEqual(state, before);
  }
});

test('duplicate job participant rejects and restores the old assignment', () => {
  const state = initialState(), day = state.days[0], row = day.rows[0];
  assert.throws(() => setJobField(state, day, row, 'person1', 'e1'));
  assert.equal(row.people[1], null);
  assert.deepEqual(participants(day, row), ['e1', 'e2', 'e3', 'e4', 'e5']);
});

test('jobs can restore their shift employee but cannot replace that role independently', () => {
  const state = initialState(), day = state.days[0], row = day.rows[0];
  setJobField(state, day, row, 'person4', '');
  assert.equal(participantAt(day, row, 4), '');
  setJobField(state, day, row, 'person4', 'e5');
  assert.equal(participantAt(day, row, 4), 'e5');
  assert.throws(() => setJobField(state, day, row, 'person4', 'e8'));
  assert.equal(participantAt(day, row, 4), 'e5');
});

test('multirow paste preserves merged shift totals when later cells are empty', () => {
  const state = initialState();
  const next = candidateEdit(state, candidate => applyPaste(candidate, '2026-09-01', 0, column('pay'), '12345\t-500\t11\n\t\t'));
  assert.equal(next.days[0].pay, 12345);
  assert.equal(next.days[0].adjustment, -500);
  assert.equal(next.days[0].hoursOverride, 11);
});

test('combined extra-worker column pastes two names and clears both roles when empty', () => {
  const state = initialState();
  const next = candidateEdit(state, candidate => applyPaste(candidate, '2026-09-01', 0, column('person3'), 'Михаил Р., Сергей В.\tДА\n\tНЕТ'));
  assert.deepEqual(next.days[0].rows[0].people.slice(3), ['e4', 'e5']);
  assert.deepEqual(next.days[0].rows[1].people.slice(3), ['', '']);
  assert.equal(next.days[0].rows[0].invoice, 'ДА');
  assert.equal(next.days[0].rows[1].invoice, 'НЕТ');
});

test('quoted multiline TSV preserves embedded tabs, newlines and escaped quotation marks', () => {
  const text = '"Первая строка\r\nВторая\tчасть с ""кавычками"""\tЗаметка\r\nДругой объект\t"Еще\r\nстрока"\r\n';
  assert.deepEqual(parseTsv(text), [['Первая строка\nВторая\tчасть с "кавычками"', 'Заметка'], ['Другой объект', 'Еще\nстрока']]);
  const state = initialState();
  const next = candidateEdit(state, candidate => applyPaste(candidate, '2026-09-04', 0, column('object'), text));
  assert.equal(next.days[3].rows[0].object, 'Первая строка\nВторая\tчасть с "кавычками"');
  assert.equal(next.days[3].rows[1].phone, 'Еще\nстрока');
  const before = clone(state);
  assert.throws(() => candidateEdit(state, candidate => applyPaste(candidate, '2026-09-04', 0, column('object'), '"Незакрытая строка\tЗаметка')));
  assert.deepEqual(state, before);
});

test('conflicting merged totals reject the entire candidate while identical totals are allowed', () => {
  const state = initialState(), before = clone(state);
  for (const [field, text] of [['pay', '12345\n12346'], ['adjustment', '-500\n500'], ['shiftHours', '11\n12']]) {
    assert.throws(() => candidateEdit(state, candidate => applyPaste(candidate, '2026-09-01', 0, column(field), text)), /разные итоги/);
    assert.deepEqual(state, before);
  }
  const next = candidateEdit(state, candidate => applyPaste(candidate, '2026-09-01', 0, column('pay'), '12345\t-500\t11\n12345\t-500\t11'));
  assert.equal(next.days[0].pay, 12345);
  assert.equal(next.days[0].adjustment, -500);
  assert.equal(next.days[0].hoursOverride, 11);
});

test('shift pay selects the correct inclusive boundary for drivers and non-drivers', () => {
  const state = initialState(), day = state.days[0];
  day.roster = ['e1', '', '', '', '']; day.statuses = ['РД', '', '', '', ''];
  day.rows = [blankRow()]; day.rows[0].type = 'ЧВ';
  const cases = [[0,1500,1500], [0.25,2500,2500], [3,2500,2500], [3.25,3300,3700], [5,3300,3700], [5.25,4500,5000], [7,4500,5000], [7.25,6400,7000], [9,6400,7000], [9.25,7500,8300], [10,7500,8300], [10.25,8500,9500], [11,8500,9500], [11.25,10400,11500]];
  for (const [hours, nonDriver, driver] of cases) {
    day.rows[0].hours = hours;
    state.employees[0].driver = false; assert.equal(basicPay(state, day), nonDriver, `non-driver: ${hours}`);
    state.employees[0].driver = true; assert.equal(basicPay(state, day), driver, `driver: ${hours}`);
  }
  day.statuses[0] = 'ОТП'; assert.equal(basicPay(state, day), 1500);
  day.statuses[0] = 'ВЫХ'; assert.equal(basicPay(state, day), 0);
});

test('manual totals support zero and clearing restores formulas; adjustment is separate', () => {
  const state = initialState(), day = state.days[0], row = day.rows[0];
  setJobField(state, day, row, 'pay', '0'); assert.equal(dayPay(state, day), 0);
  setJobField(state, day, row, 'pay', '12345'); assert.equal(dayPay(state, day), 12345);
  setJobField(state, day, row, 'pay', ''); assert.equal(dayPay(state, day), 38500);
  setJobField(state, day, row, 'shiftHours', '0'); assert.equal(dayHours(day), 0);
  setJobField(state, day, row, 'shiftHours', '3,5'); assert.equal(monthHours(state), 14);
  assert.equal(Object.fromEntries(typeTotals(state))['ЧВ'], 16);
  setJobField(state, day, row, 'shiftHours', ''); assert.equal(dayHours(day), 11);
  setJobField(state, day, row, 'adjustment', '-500'); assert.equal(day.adjustment, -500);
  assert.equal(dayPay(state, day), 38500);
  for (const [field, value] of [['pay','-1'], ['hours','24.1'], ['shiftHours','1001'], ['hours','NaN']]) assert.throws(() => setJobField(state, day, row, field, value));
});

test('menu refuses renaming referenced or semantic codes and duplicate employee names', () => {
  const state = initialState(), before = clone(state);
  for (const [kind,id,field,value] of [['workTypes','ЧВ','code','ВЕНТ'], ['workTypes','ПРЗД','code','ТРАНСПОРТ'], ['statuses','РД','code','РАБ'], ['positions','Бригадир','code','Руководитель'], ['objects','101','id','999'], ['employees','e1','group','Офис'], ['employees','e2','name','алексей с.']]) {
    assert.throws(() => change(state, kind, id, field, value));
  }
  assert.deepEqual(state, before);
  change(state, 'workTypes', 'ЧК', 'code', 'КАН');
  assert.ok(state.workTypes.some(entry => entry.code === 'КАН'));
});

test('object edits update inherited values but retain manually edited job values', () => {
  const state = initialState(), row = state.days[0].rows[0], other = state.days[1].rows[0];
  row.task = 'Ручное дополнение';
  change(state, 'objects', '101', 'task', 'Новая стандартная задача');
  assert.equal(row.task, 'Ручное дополнение');
  assert.equal(other.task, 'Новая стандартная задача');
  assert.throws(() => change(state, 'objects', '101', 'tech', 'javascript:alert(1)'));
});

test('inactive employees keep historic participation but cannot receive new assignments', () => {
  const state = initialState();
  change(state, 'employees', 'e1', 'active', undefined, false);
  assert.equal(employeeHours(state, 'e1'), 21.5);
  assert.throws(() => validateRoster(state, ['e1', '', '', '', '']));
});

test('rate edits retain ordered boundaries and immediately feed automatic pay', () => {
  const state = initialState(), before = clone(state.rates);
  for (const [id, value] of [['zero','1'], ['h3','5'], ['h5','3'], ['more','24'], ['leave','0'], ['h3','']]) assert.throws(() => change(state, 'rates', id, 'maxHours', value));
  assert.deepEqual(state.rates, before);
  change(state, 'rates', 'h3', 'nonDriver', '2600');
  assert.equal(dayPay(state, state.days[0]), 38600);
});

test('new menu records have unique stable identifiers and escaped rendered values', () => {
  const state = initialState();
  for (const action of ['add-employee','add-object','add-type','add-status','add-position']) {
    assert.equal(handleMenuAction(state, { dataset: { menuAction: action } }), true);
    assert.equal(handleMenuAction(state, { dataset: { menuAction: action } }), true);
  }
  for (const [kind, key] of [['employees','id'], ['objects','id'], ['workTypes','code'], ['statuses','code'], ['positions','code']]) {
    assert.equal(new Set(state[kind].map(record => record[key])).size, state[kind].length);
  }
  state.employees[0].name = '<img src=x onerror=alert(1)>';
  const html = renderMenu(state, 'employees');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x'));
});

test('invoice dictionary renaming remains usable in the schedule', () => {
  const state = initialState(), day = state.days[0], row = day.rows[0];
  change(state, 'invoices', 0, 'code', 'ВЫСТАВЛЕН');
  assert.ok(state.invoiceStates.includes('ВЫСТАВЛЕН'));
  setJobField(state, day, row, 'invoice', 'ВЫСТАВЛЕН');
  assert.equal(row.invoice, 'ВЫСТАВЛЕН');
});

test('CSV carries automatic pay and only repeats shift totals on the first record', () => {
  const state = initialState(), csv = toCsv(state), records = csvRecords(csv);
  assert.equal(csv[0], '\ufeff');
  assert.equal(records[0].length, 29);
  assert.equal(records[1][7], String(dayPay(state, state.days[0])));
  assert.equal(records[2][7], '');
  assert.equal(records[1][9], '11');
  assert.equal(records[2][9], '');
});

test('CSV retains all dates and the empty third shift with leave pay and employee statuses', () => {
  const state = initialState(), records = csvRecords(toCsv(state));
  const third = records.filter(record => record[0] === '2026-09-03');
  assert.equal(new Set(records.slice(1).map(record => record[0])).size, 30);
  assert.equal(third.length, 1);
  assert.equal(third[0][7], '1500');
  assert.equal(third[0][9], '0');
  assert.equal(third[0][11], '');
  assert.deepEqual(third[0].slice(19, 23), ['Алексей С.', 'ОТП', 'Дмитрий К.', 'Б2']);
  state.days[2].pay = 3210; state.days[2].adjustment = -100;
  const updated = csvRecords(toCsv(state)).find(record => record[0] === '2026-09-03');
  assert.equal(updated[7], '3210'); assert.equal(updated[8], '-100');
});

test('CSV neutralizes spreadsheet formulas, preserves negative numbers and quotes multiline cells', () => {
  const state = initialState(), row = state.days[0].rows[0];
  row.object = '=1+1'; row.phone = '+7 (000) 000'; row.objectNotes = '  @SUM(A1)'; row.task = '-2+3';
  row.notes = 'Слова; "кавычки"\nвторая строка'; state.days[0].adjustment = -500;
  const records = csvRecords(toCsv(state)), first = records[1];
  assert.equal(first[13], "'=1+1"); assert.equal(first[14], "'+7 (000) 000");
  assert.equal(first[15], "'  @SUM(A1)"); assert.equal(first[16], "'-2+3");
  assert.equal(first[17], 'Слова; "кавычки"\nвторая строка');
  assert.equal(first[8], '-500');
  assert.ok(records.every(record => record.length === 29));
});
