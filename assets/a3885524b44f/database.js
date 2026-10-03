import {createDemoDatabase} from './seed.js';

export const STORAGE_KEY = 'work-schedule-demo-v2';
export const SESSION_KEY = 'work-schedule-demo-auth-v2';
export const IDLE_SECONDS = 15 * 60;
export const clone = value => structuredClone(value);
export const uid = () => crypto.randomUUID();
export const now = () => Math.floor(Date.now() / 1000);
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yekaterinburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export class ApiError extends Error {
  constructor(message,status = 422,code = 'invalid_data',details) {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.details = details;
  }
}
export function ensure(condition,message,status = 422,code = 'invalid_data',details) {
  if (!condition) throw new ApiError(message,status,code,details);
}
export function publicUser(user) {
  return Object.fromEntries(['id','login','name','role','employeeId','active','mustChangePassword','version'].map(key => [key,user[key]]));
}
export function emptyJob(id = uid()) {
  return {id,time:'',people:[null,null,null,null,null],invoice:'',type:'',hours:null,objectId:'',object:'',objectExtra:'',phone:'',objectNotes:'',task:'',notes:'',notesExtra:'',tech:'',tech2:''};
}
export function emptyDay(brigadeId,date) {
  return {id:`${brigadeId}:${date}`,brigadeId,date,version:0,roster:['','','','',''],statuses:['','','','',''],
    rows:Array.from({length:5},(_,index) => emptyJob(`${brigadeId}:${date}:${index}`)),pay:null,hoursOverride:null,
    adjustment:null,adjustmentComment:'',overrideReason:'',employeeAdjustments:[]};
}
export function periodDates(period) {
  ensure(/^\d{4}-(0[1-9]|1[0-2])$/.test(period),'Укажите месяц в формате ГГГГ-ММ.');
  const [year,month] = period.split('-').map(Number);
  ensure(year >= 1900 && year <= 9999,'Укажите корректный год.');
  return Array.from({length:new Date(Date.UTC(year,month,0)).getUTCDate()},(_,index) => `${period}-${String(index+1).padStart(2,'0')}`);
}
export function validDate(value) {
  ensure(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && periodDates(value.slice(0,7)).includes(value),'Укажите существующую дату.');
  return value;
}
export function schedule(db,brigadeId,period,{create = false} = {}) {
  const dates = periodDates(period);
  ensure(db.references.brigades.some(row => row.id === brigadeId),'Бригада не найдена.',404,'not_found');
  const key = `${brigadeId}:${period}`;
  const saved = db.schedules[key];
  const result = saved || {brigadeId,period,roster:['','','','',''],days:[]};
  const days = new Map(result.days.map(day => [day.date,day]));
  result.days = dates.map(date => days.get(date) || emptyDay(brigadeId,date));
  if (create) db.schedules[key] = result;
  return result;
}
export function findDay(db,id,{create = false} = {}) {
  const match = /^([A-Za-z0-9_-]+):(\d{4}-\d{2}-\d{2})$/.exec(id);
  ensure(match,'Некорректный идентификатор смены.');
  validDate(match[2]);
  return schedule(db,match[1],match[2].slice(0,7),{create}).days.find(day => day.date === match[2]);
}
export function yearRecord(db,value) { return db.years.find(row => Number(row.year) === Number(String(value).slice(0,4))); }
export function assertOpen(db,period) {
  const year = yearRecord(db,period);
  ensure(year,'Сначала создайте этот год в разделе «Архив».',422,'year_missing');
  ensure(!year.closed,'Период закрыт для редактирования.',409,'closed_period');
}
export function versionCheck(record,expected) {
  ensure(Number(record.version || 0) === Number(expected ?? 0),'Данные уже изменены. Обновите страницу и повторите действие.',409,'version_conflict');
}
function prepare(db) {
  db.sessions ||= {}; db.calendarLocks ||= {}; db.shiftLocks ||= {}; db.audit ||= []; db.vacations ||= []; db.payrollSnapshots ||= {};
  db.settings ||= {};
  db.settings.showEmployeePayImmediately ??= false;
  for (const value of Object.values(db.schedules)) for (const day of value.days) {
    day.rows ||= day.jobs || []; delete day.jobs;
    day.pay ??= null; day.employeeAdjustments ||= []; day.overrideReason ||= '';
    day.rows = day.rows.map(row => ({...emptyJob(row.id),...row}));
  }
  return db;
}
export function loadDatabase() {
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEY); }
  catch { throw new ApiError('Браузер запретил локальное хранилище. Разрешите его для работы демо.',0,'storage_error'); }
  if (!raw) return prepare(createDemoDatabase());
  try {
    const db = JSON.parse(raw);
    ensure(db.schema === 1 && db.references && Array.isArray(db.users) && db.schedules,'Не удалось прочитать сохраненные демо-данные.');
    return prepare(db);
  } catch { throw new ApiError('Сохраненные демо-данные повреждены. Автоматический сброс не выполнен.',0,'storage_error'); }
}
export function saveDatabase(db) {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(db)); }
  catch { throw new ApiError('Недостаточно места в браузере. Изменения не сохранены.',0,'storage_error'); }
}
export function releaseUserLocks(db,userId,token = null) {
  for (const locks of [db.calendarLocks,db.shiftLocks]) for (const [key,lock] of Object.entries(locks)) {
    if (lock.userId === userId && (token === null || lock.sessionToken === token)) delete locks[key];
  }
}
export function cleanup(db) {
  const time = now();
  for (const [id,session] of Object.entries(db.sessions)) if (session.expiresAt <= time) { delete db.sessions[id]; releaseUserLocks(db,id); }
  for (const locks of [db.calendarLocks,db.shiftLocks]) for (const [key,lock] of Object.entries(locks)) {
    const session = db.sessions[lock.userId];
    if (lock.expiresAt <= time || !session || session.token !== lock.sessionToken) delete locks[key];
  }
  const cutoff = new Date(); cutoff.setUTCMonth(cutoff.getUTCMonth()-3);
  db.audit = db.audit.filter(item => Date.parse(item.createdAt) >= cutoff.getTime());
}
function withoutSecrets(value) {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|token|csrf/i.test(key)).map(([key,item]) => [key,withoutSecrets(item)]));
}
export function audit(db,user,action,entityType,entityId,before = null,after = null,context = {}) {
  db.audit.unshift({id:uid(),userId:user.id,userName:user.name,userLogin:user.login,action,entityType,entityId,
    createdAt:new Date().toISOString(),details:withoutSecrets({before,after,context,actor:{name:user.name,login:user.login}})});
}
