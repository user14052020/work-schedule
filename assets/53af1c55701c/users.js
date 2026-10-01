import {api} from './api-client.js';
import {state} from './state.js';
import {escape,options,option,toast,loading,failure,openDialog,pageHeading} from './ui.js';
import {generateLogin,generatePassword} from './credentials.js';

const roleLabels = {admin:'Администратор',office:'Офис',field:'Поле'};

function accessFields(login,password,{readOnly = false} = {}) {
  return `<label>Логин<input name="login" value="${escape(login)}" autocomplete="off" required pattern="[A-Za-z0-9_.@-]+" ${readOnly ? 'readonly' : ''}></label><label>Временный пароль<input name="password" type="password" value="${escape(password)}" minlength="10" autocomplete="new-password" required ${readOnly ? 'readonly' : ''}></label><div class="access-actions"><button type="button" class="text-button" data-show-password aria-pressed="false">Показать пароль</button><button type="button" class="button" data-copy-access>Скопировать доступ</button>${readOnly ? '' : '<button type="button" class="text-button" data-generate-access>Сгенерировать заново</button>'}</div>`;
}

function bindAccessActions(dialog) {
  const password = dialog.querySelector('[name="password"]');
  const login = dialog.querySelector('[name="login"]');
  dialog.querySelector('[data-show-password]').onclick = event => {
    const visible = password.type === 'password'; password.type = visible ? 'text' : 'password';
    event.currentTarget.textContent = visible ? 'Скрыть пароль' : 'Показать пароль';
    event.currentTarget.setAttribute('aria-pressed',String(visible));
  };
  dialog.querySelector('[data-copy-access]').onclick = async () => {
    if (!login.value || !password.value) { toast('Сначала укажите ФИО для генерации логина.',true); return; }
    try { await navigator.clipboard.writeText(`Логин: ${login.value}\nПароль: ${password.value}`); toast('Логин и пароль скопированы'); }
    catch { password.type = 'text'; dialog.querySelector('[data-show-password]').textContent = 'Скрыть пароль'; dialog.querySelector('[data-show-password]').setAttribute('aria-pressed','true'); password.select(); toast('Не удалось скопировать автоматически. Скопируйте логин и пароль из полей.',true); }
  };
  dialog.addEventListener('close',() => { password.value = ''; password.removeAttribute('value'); },{once:true});
}
export function passwordDialog({mandatory = false, onComplete} = {}) {
  const inputType = mandatory ? 'text' : 'password';
  const hint = mandatory ? 'Можно использовать предложенный пароль или ввести свой. ' : '';
  const dialog = openDialog(mandatory ? 'Установите свой пароль' : 'Смена пароля',`<p class="muted">${hint}Новый пароль должен содержать не менее 10 символов.</p><label>Текущий пароль<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>Новый пароль<input name="newPassword" type="${inputType}" autocomplete="new-password" autocapitalize="off" spellcheck="false" minlength="10" required></label><label>Повторите новый пароль<input name="repeatPassword" type="${inputType}" autocomplete="new-password" autocapitalize="off" spellcheck="false" minlength="10" required></label>${mandatory ? '<button type="button" class="text-button" data-show-password aria-pressed="true">Скрыть пароль</button>' : ''}`,async data => {
    if (data.get('newPassword') !== data.get('repeatPassword')) throw Error('Новые пароли не совпадают.');
    await api.post('/auth/password',{currentPassword:data.get('currentPassword'),newPassword:data.get('newPassword')});
    state.user.mustChangePassword = false; toast('Пароль изменен'); if (onComplete) await onComplete();
  },{mandatory,submit:'Сменить пароль'});
  const newPasswordFields = [...dialog.querySelectorAll('[name="newPassword"],[name="repeatPassword"]')];
  if (mandatory) {
    const password = generatePassword();
    newPasswordFields.forEach(input => { input.value = password; });
    dialog.querySelector('[data-show-password]').onclick = event => {
      const visible = newPasswordFields[0].type === 'password';
      newPasswordFields.forEach(input => { input.type = visible ? 'text' : 'password'; });
      event.currentTarget.textContent = visible ? 'Скрыть пароль' : 'Показать пароль';
      event.currentTarget.setAttribute('aria-pressed',String(visible));
    };
  }
  const passwordFields = [...dialog.querySelectorAll('input')];
  dialog.addEventListener('close',() => { passwordFields.forEach(input => { input.value = ''; }); },{once:true});
  return dialog;
}

export class UsersView {
  constructor(container,{embedded = false} = {}) { this.container = container; this.embedded = embedded; this.rows = []; this.disposed = false; }
  async mount() { await this.load(); }
  async load() {
    loading(this.container);
    try { const data = await api.get('/users'); if (this.disposed) return; this.rows = Array.isArray(data) ? data : data.items || data.users || []; this.render(); }
    catch(error) { if (!this.disposed) failure(this.container,error,() => this.load()); }
  }
  async saveWithVersion(operation) {
    try { return await operation(); }
    catch(error) {
      if (error.code === 'version_conflict') {
        await this.load();
        throw Error('Пользователь уже изменен. Закройте форму и откройте запись заново. Введенные здесь данные не отправлены.');
      }
      throw error;
    }
  }
  render() {
    const addButton = '<button class="primary" data-add>＋ Создать пользователя</button>';
    const heading = this.embedded ? `<div class="list-toolbar"><h2>Пользователи</h2>${addButton}</div>` : pageHeading('Пользователи','Доступ к системе, пароли и блокировка учетных записей.',addButton);
    this.container.innerHTML = heading + `<div class="data-table-scroll"><table class="data-table"><thead><tr><th>Имя</th><th>Логин</th><th>Роль</th><th>Сотрудник</th><th>Доступ</th><th>Действия</th></tr></thead><tbody>${this.rows.map(user => `<tr class="${user.active ? '' : 'inactive'}"><td>${escape(user.name)}</td><td>${escape(user.login)}</td><td>${roleLabels[user.role] || escape(user.role)}</td><td>${escape(state.employeeName(user.employeeId))}</td><td>${user.active ? 'Разрешен' : 'Заблокирован'}</td><td><button class="text-button" data-edit="${escape(user.id)}">Изменить</button><button class="text-button" data-reset="${escape(user.id)}">Сбросить пароль</button></td></tr>`).join('')}</tbody></table></div>`;
    this.container.querySelector('[data-add]').onclick = () => this.edit();
    this.container.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => this.edit(this.rows.find(user => String(user.id) === button.dataset.edit)));
    this.container.querySelectorAll('[data-reset]').forEach(button => button.onclick = () => this.reset(this.rows.find(user => String(user.id) === button.dataset.reset)));
  }
  edit(user = {}) {
    const dialog = openDialog(user.id ? 'Изменить пользователя' : 'Новый пользователь',`<p class="muted small">Права доступа определяются ролью этой учетной записи.</p><label>ФИО<input name="name" required value="${escape(user.name)}" autocomplete="off"></label>${user.id ? `<p class="muted">Логин: ${escape(user.login)}</p>` : ''}<div class="form-grid"><label>Роль<select name="role">${Object.entries(roleLabels).map(([value,label]) => option(value,label,user.role || 'field')).join('')}</select></label><label>Сотрудник<select name="employeeId">${options(state.references.employees,user.employeeId,{label:'name'})}</select></label></div>${user.id ? '<label class="check-label"><input name="active" type="checkbox" '+(user.active ? 'checked' : '')+'>Доступ разрешен</label>' : accessFields(generateLogin(user.name,this.rows.map(item => item.login)),generatePassword())}`,async data => {
      const payload = Object.fromEntries(data); payload.active = user.id ? data.has('active') : true; payload.employeeId ||= null;
      if (user.id) payload.expectedVersion = user.version;
      if (payload.role === 'field' && !payload.employeeId) throw Error('Для пользователя «Поле» выберите сотрудника.');
      if (user.id) await this.saveWithVersion(() => api.put(`/users/${encodeURIComponent(user.id)}`,payload)); else await api.post('/users',payload);
      await this.load();
      if (this.disposed || !state.admin) return false;
      toast('Пользователь сохранен');
      if (!user.id) {
        const accessDialog = openDialog('Пользователь создан',`<p>${escape(payload.name)}</p>${accessFields(payload.login,payload.password,{readOnly:true})}<p class="muted small">Передайте эти данные сотруднику. При первом входе он установит свой пароль.</p>`);
        bindAccessActions(accessDialog);
        return false;
      }
    });
    if (user.id) return;
    bindAccessActions(dialog);
    const nameInput = dialog.querySelector('[name="name"]');
    const loginInput = dialog.querySelector('[name="login"]');
    let generatedLogin = loginInput.value;
    let employeeName = '';
    const updateLogin = (force = false) => {
      if (!force && loginInput.value !== generatedLogin && loginInput.value !== '') return;
      generatedLogin = generateLogin(nameInput.value,this.rows.map(item => item.login)); loginInput.value = generatedLogin;
    };
    nameInput.oninput = () => updateLogin();
    dialog.querySelector('[data-generate-access]').onclick = () => {
      updateLogin(true); dialog.querySelector('[name="password"]').value = generatePassword();
    };
    dialog.querySelector('[name="employeeId"]').onchange = event => {
      const employee = state.employee(event.target.value);
      const reference = state.references.roles?.find(role => role.id === employee?.roleId);
      const role = reference?.metadata?.systemRole || reference?.code;
      if (Object.hasOwn(roleLabels,role)) dialog.querySelector('[name="role"]').value = role;
      if (!nameInput.value || nameInput.value === employeeName) nameInput.value = employee?.name || '';
      employeeName = employee?.name || '';
      updateLogin();
    };
  }
  reset(user) {
    openDialog(`Новый пароль: ${user.name}`,`<p class="muted">Текущие сеансы пользователя будут закрыты. При следующем входе потребуется сменить временный пароль.</p><label>Временный пароль<input name="password" type="password" minlength="10" autocomplete="new-password" required></label>`,async data => { await this.saveWithVersion(() => api.post(`/users/${encodeURIComponent(user.id)}/password`,{password:data.get('password'),expectedVersion:user.version})); await this.load(); toast('Пароль сброшен'); });
  }
  async dispose() { this.disposed = true; }
}
