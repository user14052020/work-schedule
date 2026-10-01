import {api} from './api-client.js';
import {state} from './state.js';
import {escape,toast,showError,openDialog} from './ui.js';
import {ScheduleView} from './schedule.js';
import {DirectoriesView} from './directories.js';
import {passwordDialog} from './users.js';
import {SearchView} from './search.js';
import {VacationsView} from './vacations.js';
import {SettingsView} from './settings.js';
import {AuditView} from './audit.js';
import {SessionActivity} from './session-activity.js';

let currentView = null;
let navigating = false;
let loggingOut = false;
let checkingSession = false;
let expiring = false;
let sessionCleanup = Promise.resolve();
const sessionActivity = new SessionActivity();
const workspace = document.querySelector('#workspace');
const loginView = document.querySelector('#login-view');
const appView = document.querySelector('#app-view');
const account = document.querySelector('.account');
const accountToggle = document.querySelector('#account-toggle');
const accountMenu = document.querySelector('#account-menu');
const navigation = [
  ['schedule','График бригады',['admin','office']], ['personal','Личный график',['field']],
  ['dictionaries','Справочники',['admin','office']],
  ['search','Поиск',['admin','office']], ['vacations','Отпуска',['admin','office','field']],
  ['archive','Архив',['admin','office']], ['audit','Журнал действий',['admin','office']], ['settings','Пояснения',['admin']]
];

function updateInteraction() {
  const busy = navigating || loggingOut || checkingSession;
  appView.inert = busy;
  document.querySelector('#dialog').inert = busy;
  workspace.setAttribute('aria-busy',String(navigating || loggingOut));
}

function closeAccountMenu({restoreFocus = false} = {}) {
  accountMenu.hidden = true;
  accountToggle.setAttribute('aria-expanded','false');
  if (restoreFocus) accountToggle.focus();
}
accountToggle.onclick = () => {
  const expanded = accountMenu.hidden;
  accountMenu.hidden = !expanded;
  accountToggle.setAttribute('aria-expanded',String(expanded));
};
document.addEventListener('click',event => {
  if (!account.contains(event.target)) closeAccountMenu();
});
account.addEventListener('focusout',event => {
  if (!account.contains(event.relatedTarget)) closeAccountMenu();
});
document.addEventListener('keydown',event => {
  if (event.key === 'Escape' && !accountMenu.hidden) {
    event.preventDefault(); closeAccountMenu({restoreFocus:true});
  }
});

function showLogin(message = '') {
  sessionActivity.stop();
  closeAccountMenu();
  loginView.hidden = false; appView.hidden = true; document.querySelector('#initial-loading').hidden = true;
  const error = document.querySelector('#login-error'); error.hidden = !message; error.textContent = message;
  document.body.classList.remove('graph-only');
}
function clearPrivateView() {
  state.user = null; state.references = {}; state.settings = {}; state.years = [];
  state.period = ''; state.brigadeId = ''; state.currentDate = '';
  document.querySelector('#main-nav').replaceChildren();
  document.querySelector('#account-name').textContent = '';
  workspace.replaceChildren();
  const dialog = document.querySelector('#dialog');
  if (dialog.open) dialog.close();
  dialog.replaceChildren();
  document.querySelector('#toast').hidden = true;
}
function finishSession(message = '', {logout = false} = {}) {
  if (expiring) return sessionCleanup;
  expiring = true;
  const previous = currentView; currentView = null;
  sessionActivity.stop(); api.cancelPending();
  clearPrivateView(); showLogin(message);
  // Release leases without saving edits after the account was revoked or timed out.
  if (previous) void previous.dispose({discard:true}).catch(() => {});
  sessionCleanup = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),3000);
    try { if (logout && api.csrfToken) await api.post('/auth/logout',{}, {signal:controller.signal,keepalive:true}); }
    catch { /* The server independently rejects the expired session. */ }
    finally { clearTimeout(timer); api.cancelPending(); api.csrfToken = ''; expiring = false; }
  })();
  return sessionCleanup;
}
async function initialize() {
  closeAccountMenu();
  const bootstrap = await api.get('/bootstrap'); state.initialize(bootstrap);
  loginView.hidden = true; appView.hidden = false; document.querySelector('#initial-loading').hidden = true;
  document.querySelector('#account-name').textContent = state.user.name;
  const allowed = navigation.filter(([, , roles]) => roles.includes(state.user.role));
  document.querySelector('#main-nav').innerHTML = allowed.map(([view,title]) => `<button data-view="${view}">${title}</button>`).join('');
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => navigate(button.dataset.view));
  document.querySelector('#connection-status').textContent = 'Демо · хранение в этом браузере';
  if (state.user.mustChangePassword) {
    workspace.innerHTML = '<div class="loading">Для начала работы установите свой пароль.</div>';
    passwordDialog({mandatory:true,onComplete:async () => navigate(state.editable ? 'schedule' : 'personal')});
  } else await navigate(state.editable ? 'schedule' : 'personal');
}
async function enterSession(session) {
  closeAccountMenu();
  if (!session.user.mustChangePassword) return initialize();
  state.user = session.user;
  loginView.hidden = true; appView.hidden = false; document.querySelector('#initial-loading').hidden = true;
  document.querySelector('#account-name').textContent = state.user.name;
  document.querySelector('#main-nav').innerHTML = '';
  workspace.innerHTML = '<div class="loading">Для начала работы установите свой пароль.</div>';
  passwordDialog({mandatory:true,onComplete:initialize});
}
async function navigate(view) {
  if (navigating || loggingOut || expiring) return;
  if (!navigation.some(([key,,roles]) => key === view && roles.includes(state.user?.role))) return;
  navigating = true; updateInteraction();
  try {
    if (currentView) await currentView.dispose();
    if (!state.user || expiring) return;
    document.body.classList.remove('graph-only'); state.view = view;
    workspace.classList.toggle('schedule-workspace',['schedule','personal'].includes(view));
    document.querySelectorAll('[data-view]').forEach(button => { button.classList.toggle('active',button.dataset.view === view); if (button.dataset.view === view) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
    const views = {schedule:() => new ScheduleView(workspace),personal:() => new ScheduleView(workspace,{personal:true}),dictionaries:() => new DirectoriesView(workspace),search:() => new SearchView(workspace),vacations:() => new VacationsView(workspace),archive:() => new SettingsView(workspace,{archive:true}),settings:() => new SettingsView(workspace),audit:() => new AuditView(workspace)};
    currentView = views[view](); await currentView.mount();
  } catch(error) { if (error.name !== 'AbortError' && state.user) showError(error); } finally { navigating = false; updateInteraction(); }
}
document.querySelector('#login-form').onsubmit = async event => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try { await sessionCleanup; const session = await api.post('/auth/login',Object.fromEntries(new FormData(form))); form.querySelector('[name="password"]').value = ''; await enterSession(session); }
  catch(error) { if (error.name !== 'AbortError') showLogin(error.message); } finally { button.disabled = false; }
};
document.querySelector('#logout').onclick = async () => {
  if (loggingOut || navigating || expiring) return;
  loggingOut = true; updateInteraction();
  closeAccountMenu({restoreFocus:true});
  try { if (currentView) await currentView.dispose(); await api.post('/auth/logout'); currentView = null; await finishSession(); }
  catch(error) { if (state.user) showError(error); }
  finally { loggingOut = false; updateInteraction(); }
};
document.querySelector('#own-password').onclick = async () => {
  closeAccountMenu({restoreFocus:true});
  try { await currentView?.editor?.flush(); passwordDialog({onComplete:async () => navigate(state.view)}); }
  catch(error) { showError(error); }
};
document.querySelector('#help').onclick = () => openDialog('Как пользоваться',`<div class="help-text">${escape(state.settings.usageHelp || 'Выберите период и бригаду. Разверните нужный день, чтобы просмотреть работы.')}</div>`);
window.addEventListener('navigate',event => navigate(event.detail));
window.addEventListener('session-checking',event => {
  checkingSession = event.detail.checking; updateInteraction();
});
window.addEventListener('session-expired',event => {
  const idle = event.detail?.reason === 'idle';
  void finishSession((idle ? 'Сеанс завершен после 15 минут бездействия.' : 'Сеанс завершен или выполнен вход на другом устройстве.') + ' Несохраненные изменения не отправлены. Войдите снова.');
});
window.addEventListener('offline',() => { document.querySelector('#connection-status').textContent = 'Демо · хранение в этом браузере'; toast('Вы работаете с локальными данными демо.',true); });
window.addEventListener('online',() => { document.querySelector('#connection-status').textContent = 'Демо · хранение в этом браузере'; toast('Подключение восстановлено. Данные демо хранятся в этом браузере.'); });

api.get('/auth/session').then(enterSession).catch(error => { if (error.name !== 'AbortError') showLogin(error.status === 401 ? '' : error.message); });
