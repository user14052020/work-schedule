import {ApiError,SESSION_KEY,IDLE_SECONDS,clone,uid,now,today,ensure,publicUser,loadDatabase,saveDatabase,cleanup,releaseUserLocks,audit,schedule,findDay,yearRecord,assertOpen,periodDates,validDate,versionCheck} from './database.js';
import {decorate,personalDay,participants,calculate} from './calculations.js';

export {ApiError};
export const query = values => new URLSearchParams(Object.entries(values).filter(([,value]) => value !== undefined && value !== null)).toString();
const tabId = uid();
const readReceipt = () => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } };
const remember = receipt => { try { receipt ? sessionStorage.setItem(SESSION_KEY,JSON.stringify(receipt)) : sessionStorage.removeItem(SESSION_KEY); } catch { throw new ApiError('Разрешите хранение сессии в браузере.',0,'storage_error'); } };
const office = user => ensure(['admin','office'].includes(user.role),'Недостаточно прав доступа.',403,'forbidden');
const admin = user => ensure(user.role === 'admin','Действие доступно только администратору.',403,'forbidden');
const password = value => ensure(typeof value === 'string' && value.length >= 10,'Пароль должен содержать не менее 10 символов.');
const sessionPayload = (db,user) => ({user:publicUser(user),csrfToken:db.sessions[user.id].token,
  session:{idleTimeoutSeconds:IDLE_SECONDS,expiresAt:db.sessions[user.id].expiresAt,serverTime:now()}});
const safeId = id => ensure(typeof id === 'string' && id.length > 0 && id.length <= 150 && !['__proto__','prototype','constructor'].includes(id),'Некорректный идентификатор.');
function currentUser(db) {
  const receipt = readReceipt(),user = db.users.find(row => row.id === receipt?.userId);
  const session = user && db.sessions[user.id];
  ensure(user?.active && session && session.token === receipt?.token && session.expiresAt > now(),'Сеанс завершен. Войдите снова.',401,'unauthorized');
  return user;
}
function startSession(db,user) {
  releaseUserLocks(db,user.id);
  const token = uid(); db.sessions[user.id] = {token,expiresAt:now()+IDLE_SECONDS};
  remember({userId:user.id,token}); return sessionPayload(db,user);
}
function info(db,lock,user) {
  return lock ? {mine:lock.userId === user.id && lock.sessionToken === db.sessions[user.id]?.token,
    owner:db.users.find(row => row.id === lock.userId)?.name || 'Пользователь',expiresAt:new Date(lock.expiresAt*1000).toISOString()} : null;
}
function calendarKey(db,data,{write = false} = {}) {
  ensure(typeof data.brigadeId === 'string' && typeof data.period === 'string','Выберите бригаду и месяц.');
  schedule(db,data.brigadeId,data.period);
  if (write) {
    assertOpen(db,data.period);
    ensure(db.references.brigades.find(row => row.id === data.brigadeId)?.active !== false,'Бригада отключена.');
  }
  return `${data.brigadeId}:${data.period}`;
}
function ownedCalendar(db,user,data,token = data.editToken) {
  const key = calendarKey(db,data,{write:true}),lock = db.calendarLocks[key];
  ensure(lock && lock.userId === user.id && lock.sessionToken === db.sessions[user.id]?.token && lock.token === token && lock.tabId === tabId,
    'Сначала нажмите «Начать редактирование».',409,'calendar_edit_required');
  lock.expiresAt = db.sessions[user.id].expiresAt; return lock;
}
function releaseCalendarShifts(db,resource,token) {
  for (const [id,lock] of Object.entries(db.shiftLocks)) if (id.startsWith(resource) && (!token || lock.editToken === token)) delete db.shiftLocks[id];
}
function recordRole(record) {
  ensure(['admin','office','field'].includes(record.role),'Выберите роль пользователя.');
  ensure(record.role !== 'field' || record.employeeId,'Для пользователя «Поле» выберите сотрудника.');
}
function rosterValid(db,values) {
  ensure(Array.isArray(values) && values.length === 5,'В составе должно быть пять позиций.');
  const ids = values.filter(Boolean);
  ensure(new Set(ids).size === ids.length,'Один сотрудник не может занимать две позиции в смене.');
  ensure(ids.every(id => db.references.employees.some(row => row.id === id && row.active !== false && ['field','Поля'].includes(row.group))),'Выберите действующих сотрудников группы «Поля».');
  if (values[0]) {
    const person = db.references.employees.find(row => row.id === values[0]);
    const position = db.references.positions.find(row => row.id === person?.positionId);
    ensure(['Бригадир','1/2 Бригадир'].includes(position?.code),'Выберите сотрудника с должностью «Бригадир» или «1/2 Бригадир».');
  }
}
function shiftPayload(db,source,previous,user) {
  ensure(source && Array.isArray(source.rows) && source.rows.length >= 1 && source.rows.length <= 501,'В смене должно быть от 1 до 501 работы.');
  // Historical assignments remain valid; roster edits still use current eligibility rules.
  if (JSON.stringify(source.roster) !== JSON.stringify(previous.roster)) rosterValid(db,source.roster);
  ensure(Array.isArray(source.statuses) && source.statuses.length === 5,'В смене должно быть пять статусов.');
  ensure(Array.isArray(source.roster) && source.roster.length === 5,'Некорректный состав смены.');
  if ((source.pay ?? null) !== (previous.pay ?? null)) {
    ensure(user.role === 'admin' && !yearRecord(db,source.date)?.everClosed && source.date.slice(0,7) >= today().slice(0,7),'Изменение зарплаты доступно администратору только в новых открытых периодах.',403,'forbidden');
  }
  const ids = new Set();
  const rows = source.rows.map(row => {
    safeId(row.id); ensure(!ids.has(row.id),'Работы не должны иметь одинаковый идентификатор.'); ids.add(row.id);
    ensure(Array.isArray(row.people) && row.people.length === 5,'Некорректный состав работы.');
    ensure(!row.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(row.time),'Укажите время в формате ЧЧ:ММ.');
    ensure(row.hours == null || Number.isFinite(Number(row.hours)) && Number(row.hours) >= 0,'Часы работы не могут быть отрицательными.');
    const result = {};
    for (const key of ['id','time','invoice','type','objectId','object','objectExtra','phone','objectNotes','task','notes','notesExtra','tech','tech2']) result[key] = String(row[key] ?? '');
    for (const key of ['tech','tech2']) ensure(!result[key] || /^https?:\/\//i.test(result[key]),'В техбазе допустимы только ссылки http:// или https://.');
    result.people = row.people.map(value => value == null ? null : String(value));
    ensure(result.people.filter(Boolean).every(id => db.references.employees.some(row => row.id === id)),'Сотрудник не найден.');
    result.hours = row.hours === null || row.hours === '' || row.hours === undefined ? null : Number(row.hours);
    return result;
  });
  const output = {id:previous.id,brigadeId:previous.brigadeId,date:previous.date,version:(previous.version || 0)+1,
    roster:clone(source.roster),statuses:clone(source.statuses),rows,employeeAdjustments:clone(source.employeeAdjustments || [])};
  for (const key of ['pay','hoursOverride','adjustment']) {
    output[key] = source[key] === '' || source[key] == null ? null : Number(source[key]);
    ensure(output[key] === null || Number.isFinite(output[key]) && (key === 'adjustment' || output[key] >= 0),'Некорректное числовое значение.');
  }
  for (const key of ['adjustmentComment','overrideReason']) output[key] = String(source[key] || '');
  for (const item of output.employeeAdjustments) ensure(db.references.employees.some(row => row.id === item.employeeId) && Number.isFinite(Number(item.amount)),'Некорректная индивидуальная корректировка.');
  if (previous.payrollSnapshotId) output.payrollSnapshotId = previous.payrollSnapshotId;
  const financial = value => JSON.stringify({roster:value.roster,statuses:value.statuses,pay:value.pay,hoursOverride:value.hoursOverride,adjustment:value.adjustment,
    employeeAdjustments:value.employeeAdjustments,rows:value.rows.map(({id,type,hours,people}) => ({id,type,hours,people}))});
  if (previous.frozenCalculation && financial(previous) === financial(output)) output.frozenCalculation = clone(previous.frozenCalculation);
  return output;
}
function referencesFor(db,user) {
  if (user.role !== 'field') return clone(db.references);
  const references = clone(db.references);
  references.rates = []; references.roles = [];
  references.employees = references.employees.map(({id,name,shortName,positionId,group,active}) => ({id,name,shortName,positionId,group,active}));
  references.positions = references.positions.map(({id,code,label,color,active}) => ({id,code,label,color,active}));
  return references;
}
function paginate(items,params) {
  const page = Math.max(1,Number(params.get('page')) || 1),limit = Math.max(1,Math.min(100,Number(params.get('limit')) || 50));
  return {items:items.slice((page-1)*limit,page*limit),total:items.length,page,limit};
}
function changedSnapshot(day) {
  const value = clone(day); delete value.calculated; delete value.lock; delete value.frozenCalculation; delete value.payrollSnapshotId;
  for (const row of value.rows || []) { delete row.resolvedPeople; delete row.peopleNames; }
  return value;
}
function dispatch(db,path,params,method,data) {
  if (path === '/auth/login' && method === 'POST') {
    const user = db.users.find(row => row.login.toLowerCase() === String(data.login || '').trim().toLowerCase());
    ensure(user?.active && user.password === data.password,'Неверный логин или пароль.',401,'invalid_credentials');
    audit(db,user,'login','user',user.id); return startSession(db,user);
  }
  const user = currentUser(db);
  if (path === '/auth/session') return sessionPayload(db,user);
  if (path === '/auth/activity') { db.sessions[user.id].expiresAt = now()+IDLE_SECONDS; return sessionPayload(db,user); }
  if (path === '/auth/logout') {
    audit(db,user,'logout','user',user.id); releaseUserLocks(db,user.id,db.sessions[user.id].token); delete db.sessions[user.id]; remember(null); return {loggedOut:true};
  }
  if (path === '/auth/password' && method === 'POST') {
    ensure(user.password === data.currentPassword,'Текущий пароль указан неверно.'); password(data.newPassword);
    user.password = data.newPassword; user.mustChangePassword = false; user.version++;
    audit(db,user,'password_changed','user',user.id); return startSession(db,user);
  }
  ensure(!user.mustChangePassword,'Сначала установите свой пароль.',403,'password_change_required');
  if (path === '/bootstrap') return {...sessionPayload(db,user),references:referencesFor(db,user),settings:clone(db.settings),years:clone(db.years),currentDate:today(),
    preferredPeriod:db.preferredPeriod,preferredBrigadeId:db.preferredBrigadeId};
  if (path === '/schedules') {
    office(user); const value = schedule(db,params.get('brigadeId'),params.get('period'));
    return {...clone(value),days:value.days.map(day => decorate(db,day)),closed:Boolean(yearRecord(db,value.period)?.closed)};
  }
  if (path === '/personal') {
    const period = params.get('period'); periodDates(period);
    const employeeId = user.role === 'field' ? user.employeeId : params.get('employeeId');
    ensure(employeeId,'Для пользователя не выбран сотрудник.');
    const days = Object.values(db.schedules).filter(value => value.period === period).flatMap(value => value.days.map(day => personalDay(db,day,employeeId))).filter(Boolean).sort((a,b) => a.date.localeCompare(b.date) || a.brigadeId.localeCompare(b.brigadeId));
    return {period,employeeId,days,closed:Boolean(yearRecord(db,period)?.closed)};
  }
  if (path === '/summary') {
    office(user); const date = validDate(params.get('date') || today());
    const dates = [0,1,2].map(offset => new Date(Date.parse(`${date}T00:00:00Z`)-offset*86400000).toISOString().slice(0,10));
    return {brigades:db.references.brigades.filter(row => row.active !== false).map(brigade => ({id:brigade.id,code:brigade.code,label:brigade.label,days:dates.map(date => {
      const day = db.schedules[`${brigade.id}:${date.slice(0,7)}`]?.days.find(row => row.date === date),roster = day?.roster || ['','','','',''];
      return {date,roster,names:roster.map(id => { const person = db.references.employees.find(row => row.id === id); return person?.shortName || person?.name || ''; })};
    })}))};
  }
  if (path.startsWith('/calendar-edit')) {
    office(user); const resource = method === 'GET' ? Object.fromEntries(params) : data,key = calendarKey(db,resource,{write:path.endsWith('/acquire') || path.endsWith('/renew')});
    const lock = db.calendarLocks[key];
    if (method === 'GET' && path === '/calendar-edit') return {lock:info(db,lock,user)};
    if (path.endsWith('/acquire')) {
      ensure(!lock,`Календарь редактирует ${info(db,lock,user)?.owner || 'другой пользователь'}.`,409,'calendar_locked',{lock:info(db,lock,user)});
      const entry = {token:uid(),userId:user.id,sessionToken:db.sessions[user.id].token,tabId,expiresAt:db.sessions[user.id].expiresAt};
      db.calendarLocks[key] = entry; return {token:entry.token,...info(db,entry,user)};
    }
    if (path.endsWith('/renew')) { const entry = ownedCalendar(db,user,resource,data.token); return {token:entry.token,...info(db,entry,user)}; }
    if (path.endsWith('/release')) {
      if (lock && lock.userId === user.id && lock.sessionToken === db.sessions[user.id].token && lock.token === data.token) { delete db.calendarLocks[key]; releaseCalendarShifts(db,key,lock.token); }
      return {released:true};
    }
  }
  const shiftRoute = /^\/shifts\/([^/]+)(?:\/lock(?:\/(renew|release))?)?$/.exec(path);
  if (shiftRoute) {
    office(user); const id = decodeURIComponent(shiftRoute[1]),day = findDay(db,id),resource = {brigadeId:day.brigadeId,period:day.date.slice(0,7)};
    const previousLock = db.shiftLocks[id];
    if (path.includes('/lock')) {
      if (shiftRoute[2] === 'release') {
        if (previousLock?.token === data.token && previousLock.userId === user.id) delete db.shiftLocks[id];
        return {released:true};
      }
      if (shiftRoute[2] === 'renew') {
        ensure(previousLock?.token === data.token && previousLock.userId === user.id,'Блокировка смены истекла.',409,'lock_expired');
        ownedCalendar(db,user,resource,previousLock.editToken); previousLock.expiresAt = now()+120;
        return {token:previousLock.token,...info(db,previousLock,user)};
      }
      ownedCalendar(db,user,resource,data.editToken);
      ensure(!previousLock || previousLock.userId === user.id && previousLock.tabId === tabId,'Смену редактирует другой пользователь.',409,'shift_locked');
      const lock = previousLock || {token:uid(),userId:user.id,sessionToken:db.sessions[user.id].token,editToken:data.editToken,tabId};
      lock.expiresAt = now()+120; db.shiftLocks[id] = lock; return {token:lock.token,...info(db,lock,user)};
    }
    if (method === 'PUT') {
      ownedCalendar(db,user,resource,data.editToken);
      ensure(previousLock?.token === data.lockToken && previousLock.userId === user.id && previousLock.tabId === tabId,'Блокировка смены истекла.',409,'lock_expired');
      versionCheck(day,data.expectedVersion);
      const saved = shiftPayload(db,{...data.shift,id,brigadeId:day.brigadeId,date:day.date},day,user);
      const month = schedule(db,day.brigadeId,resource.period,{create:true});
      month.days[month.days.findIndex(row => row.id === id)] = saved;
      audit(db,user,'shift_saved','shift',id,changedSnapshot(day),changedSnapshot(saved),{date:day.date,brigadeId:day.brigadeId});
      return decorate(db,saved);
    }
  }
  if (path === '/roster/apply' && method === 'POST') {
    office(user); ownedCalendar(db,user,data); rosterValid(db,data.roster);
    const month = schedule(db,data.brigadeId,data.period,{create:true}),before = clone(month.roster); let updated = 0;
    month.roster = clone(data.roster);
    for (const day of month.days) if (!day.roster.some(Boolean)) {
      const original = clone(day); day.roster = clone(data.roster); day.statuses = day.roster.map(id => id ? 'РД' : ''); day.version++; updated++;
      audit(db,user,'shift_roster_applied','shift',day.id,original,day,{date:day.date,brigadeId:day.brigadeId});
    }
    audit(db,user,'monthly_roster_updated','monthly_roster',`${data.brigadeId}:${data.period}`,{roster:before},{roster:month.roster},{period:data.period,brigadeId:data.brigadeId});
    return {updated};
  }
  if (path === '/search') {
    office(user); const text = (params.get('q') || '').trim().toLocaleLowerCase('ru'),field = params.get('field');
    ensure(text.length > 0 && text.length <= 190 && ['article','object'].includes(field),'Введите артикул или название объекта длиной до 190 символов.');
    const items = [];
    const days = Object.values(db.schedules).flatMap(value => value.days).sort((a,b) => b.date.localeCompare(a.date) || a.brigadeId.localeCompare(b.brigadeId));
    for (const source of days) for (const job of source.rows) {
      if (!(field === 'article' ? job.objectId : `${job.object}\n${job.objectExtra || ''}`).toLocaleLowerCase('ru').includes(text)) continue;
      items.push({...clone(job),people:participants(source,job,db.references),shiftId:source.id,date:source.date,brigadeId:source.brigadeId,
        brigadeCode:db.references.brigades.find(row => row.id === source.brigadeId)?.code,roster:clone(source.roster),statuses:clone(source.statuses),adjustment:source.adjustment});
    }
    return paginate(items,params);
  }
  const dictionaryRoute = /^\/dictionaries\/([A-Za-z]+)(?:\/([^/]+))?$/.exec(path);
  if (dictionaryRoute) {
    office(user); const kind = dictionaryRoute[1],id = dictionaryRoute[2] ? decodeURIComponent(dictionaryRoute[2]) : null;
    ensure(['employees','brigades','positions','workTypes','statuses','invoiceStates','rates','roles'].includes(kind),'Справочник не найден.',404,'not_found');
    if (method === 'GET') return clone(db.references[kind]);
    admin(user); const previous = id ? db.references[kind].find(row => row.id === id) : null;
    if (id) { ensure(previous,'Запись не найдена.',404,'not_found'); versionCheck(previous,data.expectedVersion); }
    const record = clone(id ? data.record : data); record.id = id || uid(); record.version = (previous?.version || 0)+1; record.active = record.active !== false;
    if (kind === 'employees') {
      ensure(String(record.name || '').trim(),'Укажите ФИО.'); record.group = ['Офис','office'].includes(record.group) ? 'office' : 'field'; record.shortName ||= record.name;
      ensure(!record.positionId || db.references.positions.some(row => row.id === record.positionId),'Должность не найдена.');
      ensure(!record.roleId || db.references.roles.some(row => row.id === record.roleId),'Роль не найдена.');
    } else if (kind === 'rates') {
      validDate(record.fromDate); ensure(Number(record.driver) >= 0 && Number(record.nonDriver) >= 0,'Ставка не может быть отрицательной.');
      ensure(record.maxHours == null || Number(record.maxHours) >= Number(record.minHours || 0),'Неверный интервал часов.');
    } else {
      ensure(String(record.code || '').trim() && String(record.label || '').trim(),'Укажите код и название.');
      ensure(!db.references[kind].some(row => row.id !== record.id && row.code.toLocaleLowerCase('ru') === record.code.toLocaleLowerCase('ru')),'Запись с таким кодом уже существует.');
      if (record.color) ensure(/^#[0-9a-f]{6}$/i.test(record.color),'Укажите цвет в формате #RRGGBB.');
    }
    if (record.effectiveFrom) validDate(record.effectiveFrom);
    // Keep one shared input snapshot rather than duplicating reference data in every old shift.
    if (previous && ['employees','positions','statuses','workTypes','rates'].includes(kind)) {
      const effective = record.effectiveFrom || today();
      const affected = Object.values(db.schedules).flatMap(month => month.days).filter(day => day.date < effective && !day.payrollSnapshotId);
      if (affected.length) {
        const snapshotId = uid(); db.payrollSnapshots[snapshotId] = clone(db.references);
        affected.forEach(day => { day.payrollSnapshotId = snapshotId; });
      }
    }
    if (id) db.references[kind][db.references[kind].findIndex(row => row.id === id)] = record; else db.references[kind].push(record);
    audit(db,user,id ? 'reference_updated' : 'reference_created',kind,record.id,previous,record); return clone(record);
  }
  const userRoute = /^\/users(?:\/([^/]+)(\/password)?)?$/.exec(path);
  if (userRoute) {
    admin(user); if (method === 'GET') return db.users.map(publicUser);
    const id = userRoute[1] ? decodeURIComponent(userRoute[1]) : null,previous = id ? db.users.find(row => row.id === id) : null;
    if (id) { ensure(previous,'Пользователь не найден.',404,'not_found'); versionCheck(previous,data.expectedVersion); }
    if (userRoute[2]) {
      password(data.password); previous.password = data.password; previous.mustChangePassword = true; previous.version++;
      delete db.sessions[id]; releaseUserLocks(db,id); audit(db,user,'password_reset','user',id); return {reset:true,version:previous.version};
    }
    const record = {...previous,id:id || uid(),name:String(data.name || '').trim(),role:data.role,employeeId:data.employeeId || null,active:data.active !== false,version:(previous?.version || 0)+1};
    recordRole(record); ensure(record.name,'Укажите ФИО.');
    ensure(!record.employeeId || db.references.employees.some(row => row.id === record.employeeId),'Сотрудник не найден.');
    if (!id) {
      record.login = String(data.login || '').trim(); ensure(/^[A-Za-z0-9_.@-]+$/.test(record.login),'Логин содержит недопустимые символы.');
      ensure(!db.users.some(row => row.login.toLowerCase() === record.login.toLowerCase()),'Логин уже занят.'); password(data.password);
      record.password = data.password; record.mustChangePassword = true; db.users.push(record);
    } else {
      ensure(!(previous.role === 'admin' && previous.active && (record.role !== 'admin' || !record.active)) || db.users.some(row => row.id !== id && row.active && row.role === 'admin'),'Нельзя отключить последнего администратора.');
      db.users[db.users.findIndex(row => row.id === id)] = record;
      if (!record.active || record.role !== previous.role || record.employeeId !== previous.employeeId) { delete db.sessions[id]; releaseUserLocks(db,id); }
    }
    audit(db,user,id ? 'user_updated' : 'user_created','user',record.id,previous ? publicUser(previous) : null,publicUser(record)); return publicUser(record);
  }
  const yearRoute = /^\/years(?:\/(\d{4})\/(close|reopen))?$/.exec(path);
  if (yearRoute) {
    office(user); if (method === 'GET') return clone(db.years); admin(user);
    if (!yearRoute[1]) {
      const year = Number(data.year); ensure(Number.isInteger(year) && year >= 1900 && year <= 9999,'Укажите корректный год.');
      ensure(!yearRecord(db,year),'Этот год уже существует.'); const record = {year,closed:false,version:1}; db.years.push(record); db.years.sort((a,b) => a.year-b.year);
      audit(db,user,'year_created','year',String(year),null,record); return clone(record);
    }
    const record = yearRecord(db,yearRoute[1]); ensure(record,'Год не найден.',404,'not_found');
    ensure(!Object.keys(db.calendarLocks).some(key => key.includes(`:${record.year}-`)),'Сначала завершите редактирование графиков этого года.',409,'calendar_locked');
    const before = clone(record);
    if (yearRoute[2] === 'close') {
      for (const month of Object.values(db.schedules)) if (month.period.startsWith(`${record.year}-`)) for (const day of month.days) day.frozenCalculation ||= calculate(day,db.payrollSnapshots[day.payrollSnapshotId] || db.references);
      record.closed = true; record.everClosed = true;
    } else { ensure(String(data.reason || '').trim(),'Укажите основание открытия года.'); record.closed = false; }
    record.version++; audit(db,user,record.closed ? 'year_closed' : 'year_reopened','year',String(record.year),before,record,{reason:data.reason}); return clone(record);
  }
  const vacationRoute = /^\/vacations(?:\/([^/]+))?$/.exec(path);
  if (vacationRoute) {
    if (method === 'GET') { const year = params.get('year'); return clone(db.vacations.filter(row => row.from <= `${year}-12-31` && row.to >= `${year}-01-01` && (user.role !== 'field' || row.employeeId === user.employeeId))); }
    admin(user); const id = vacationRoute[1] ? decodeURIComponent(vacationRoute[1]) : null,previous = id ? db.vacations.find(row => row.id === id) : null;
    if (id) { ensure(previous,'Отпуск не найден.',404,'not_found'); assertOpen(db,previous.from); assertOpen(db,previous.to); }
    if (method === 'DELETE') { db.vacations = db.vacations.filter(row => row.id !== id); audit(db,user,'vacation_deleted','vacation',id,previous,null); return {deleted:true}; }
    if (id) versionCheck(previous,data.expectedVersion);
    validDate(data.from); validDate(data.to); ensure(data.from <= data.to,'Окончание отпуска не может быть раньше начала.');
    assertOpen(db,data.from); assertOpen(db,data.to); ensure(db.references.employees.some(row => row.id === data.employeeId),'Сотрудник не найден.');
    const record = {id:id || uid(),employeeId:data.employeeId,from:data.from,to:data.to,version:(previous?.version || 0)+1};
    if (data.applyToSchedule) {
      const days = Object.values(db.schedules).flatMap(month => month.days).filter(day => day.date >= data.from && day.date <= data.to && (day.roster.includes(data.employeeId) || day.rows.some(row => participants(day,row,db.references).includes(data.employeeId))));
      ensure(!days.some(day => db.calendarLocks[`${day.brigadeId}:${day.date.slice(0,7)}`]),'Сначала завершите редактирование затронутых графиков.',409,'calendar_locked');
      const conflict = days.some(day => day.rows.some(row => participants(day,row,db.references).includes(data.employeeId)));
      ensure(!conflict || data.confirmConflicts,'Подтвердите исключение сотрудника из работ, совпадающих с отпуском.',409,'vacation_conflict');
      for (const day of days) {
        assertOpen(db,day.date); const before = clone(day);
        for (const row of day.rows) { const people = participants(day,row,db.references); people.forEach((person,index) => { if (person === data.employeeId) row.people[index] = ''; }); }
        day.roster.forEach((person,index) => { if (person === data.employeeId) day.statuses[index] = 'ОТП'; }); day.version++;
        audit(db,user,'shift_vacation_applied','shift',day.id,before,day,{date:day.date,brigadeId:day.brigadeId});
      }
    }
    if (id) db.vacations[db.vacations.findIndex(row => row.id === id)] = record; else db.vacations.push(record);
    audit(db,user,id ? 'vacation_updated' : 'vacation_created','vacation',record.id,previous,record); return clone(record);
  }
  if (path === '/settings' && method === 'PUT') {
    admin(user); const before = clone(db.settings);
    for (const key of ['shiftHelp','usageHelp']) if (Object.hasOwn(data,key)) db.settings[key] = String(data[key]);
    audit(db,user,'settings_updated','settings','help',before,db.settings); return clone(db.settings);
  }
  if (path === '/audit') { office(user); return {...paginate(db.audit,params),retention:{months:3,mode:'rolling'}}; }
  throw new ApiError('Функция не найдена в демо.',404,'not_found');
}

class ApiClient {
  csrfToken = '';
  generation = 0;
  cancelPending() { this.generation++; }
  async request(route,{method = 'GET',data = {},signal} = {}) {
    const generation = this.generation;
    const [path,search = ''] = route.split('?');
    const run = () => {
      if (signal?.aborted || generation !== this.generation) throw new DOMException('Request cancelled.','AbortError');
      const db = loadDatabase(); cleanup(db);
      let result;
      try { result = dispatch(db,path,new URLSearchParams(search),method,data); }
      catch(error) {
        if (error.status === 401 && path !== '/auth/login' && this.csrfToken) window.dispatchEvent(new CustomEvent('session-expired',{detail:{reason:'revoked'}}));
        throw error;
      }
      try { saveDatabase(db); }
      catch(error) {
        // Authentication receipts must only become active with the corresponding stored session.
        if (['/auth/login','/auth/password','/auth/logout'].includes(path)) remember(null);
        throw error;
      }
      if (result?.csrfToken) this.csrfToken = result.csrfToken;
      if (path === '/auth/login' || path === '/auth/password') this.generation++;
      if (result?.session) window.dispatchEvent(new CustomEvent('session-updated',{detail:{route:path,...result}}));
      return clone(result);
    };
    // Shared-browser demo writes are serialized across tabs, including lease acquisition.
    return navigator.locks ? navigator.locks.request('work-schedule-demo-database',{mode:'exclusive',...(signal ? {signal} : {})},run) : run();
  }
  get(route,options) { return this.request(route,options); }
  post(route,data = {},options = {}) { return this.request(route,{...options,method:'POST',data}); }
  put(route,data,options = {}) { return this.request(route,{...options,method:'PUT',data}); }
  delete(route,data = {}) { return this.request(route,{method:'DELETE',data}); }
}
export const api = new ApiClient();
