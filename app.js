// ToDo klient, vanilla JavaScript.
// Server: http://demo2.z-bit.ee/ (õpetaja REST API, serveri koodi ma ise ei tee).
const API = 'http://demo2.z-bit.ee';

const $ = (sel) => document.querySelector(sel);
const authSection = $('#auth');
const todoSection = $('#todo');
const messageEl = $('#message');

// ---------- Abifunktsioonid ----------
function getToken() { return localStorage.getItem('token'); }
function setSession(user) {
  localStorage.setItem('token', user.access_token);
  localStorage.setItem('username', user.username);
}
function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
}

function showMessage(text, ok = false) {
  messageEl.textContent = text;
  messageEl.className = ok ? 'ok' : '';
  messageEl.hidden = !text;
}

// Ühtne HTTP päring: lisab Authorization päise ja tõlgib vead arusaadavaks
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API + path, { ...options, headers });
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    if (res.status === 401) { clearSession(); render(); }
    let msg = 'Viga ' + res.status;
    if (Array.isArray(data)) msg = data.map((e) => e.message || e.field).join(', ');
    else if (data && data.message) msg = data.message;
    throw new Error(msg);
  }
  return data;
}

// ---------- Kasutaja: registreerimine, sisse- ja väljalogimine ----------
async function register(form) {
  const f = new FormData(form);
  const user = await api('/users', {
    method: 'POST',
    body: JSON.stringify({
      username: f.get('username'),
      firstname: f.get('firstname'),
      lastname: f.get('lastname'),
      newPassword: f.get('password'),
    }),
  });
  setSession(user);
}

async function login(form) {
  const f = new FormData(form);
  const user = await api('/users/get-token', {
    method: 'POST',
    body: JSON.stringify({ username: f.get('username'), password: f.get('password') }),
  });
  setSession({ ...user, username: f.get('username') });
}

// ---------- Ülesanded ----------
let tasks = [];

async function loadTasks() {
  tasks = await api('/tasks');
  renderTasks();
}

function renderTasks() {
  const list = $('#list');
  list.innerHTML = '';
  const done = tasks.filter((t) => t.marked_as_done).length;
  $('#count').textContent = tasks.length
    ? `Kokku ${tasks.length} ülesannet, tehtud ${done}`
    : 'Ülesandeid ei ole veel. Lisa esimene!';

  for (const task of tasks) {
    const li = document.createElement('li');
    if (task.marked_as_done) li.classList.add('done');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = !!task.marked_as_done;
    check.addEventListener('change', () => run(() => toggleTask(task, check.checked)));

    const text = document.createElement('div');
    text.className = 'text';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = task.title;           // textContent, mitte innerHTML (XSS)
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = task.desc || '';
    text.append(title, desc);

    const edit = button('Muuda', 'secondary', () => startEdit(li, task));
    const del = button('Kustuta', 'danger', () => run(() => removeTask(task)));
    li.append(check, text, edit, del);
    list.append(li);
  }
}

function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

async function addTask(form) {
  const f = new FormData(form);
  const task = await api('/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: f.get('title'), desc: f.get('desc') }),
  });
  tasks.unshift(task);
  form.reset();
  renderTasks();
}

async function toggleTask(task, checked) {
  const updated = await api('/tasks/' + task.id, {
    method: 'PUT',
    body: JSON.stringify({ marked_as_done: checked }),
  });
  Object.assign(task, updated);
  renderTasks();
}

function startEdit(li, task) {
  li.innerHTML = '';
  const form = document.createElement('form');
  form.className = 'edit';
  const title = Object.assign(document.createElement('input'), { value: task.title, required: true, maxLength: 255 });
  const desc = Object.assign(document.createElement('input'), { value: task.desc || '', placeholder: 'Kirjeldus' });
  const save = Object.assign(document.createElement('button'), { type: 'submit', textContent: 'Salvesta' });
  const cancel = button('Tühista', 'secondary', renderTasks);
  form.append(title, desc, save, cancel);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(async () => {
      const updated = await api('/tasks/' + task.id, {
        method: 'PUT',
        body: JSON.stringify({ title: title.value, desc: desc.value }),
      });
      Object.assign(task, updated);
      renderTasks();
    });
  });
  li.append(form);
  title.focus();
}

async function removeTask(task) {
  await api('/tasks/' + task.id, { method: 'DELETE' });
  tasks = tasks.filter((t) => t.id !== task.id);
  renderTasks();
}

// ---------- Vaated ----------
function render() {
  const loggedIn = !!getToken();
  authSection.hidden = loggedIn;
  todoSection.hidden = !loggedIn;
  $('#userbar').hidden = !loggedIn;
  $('#who').textContent = loggedIn ? 'Sisse logitud: ' + (localStorage.getItem('username') || '') : '';
  if (loggedIn) run(loadTasks);
}

// Käivitab async toimingu ja näitab veateate
async function run(fn) {
  try { showMessage(''); await fn(); }
  catch (err) { showMessage(err.message); }
}

// ---------- Sündmused ----------
$('#tab-login').addEventListener('click', () => switchTab('login'));
$('#tab-register').addEventListener('click', () => switchTab('register'));
function switchTab(name) {
  $('#login-form').hidden = name !== 'login';
  $('#register-form').hidden = name !== 'register';
  $('#tab-login').classList.toggle('active', name === 'login');
  $('#tab-register').classList.toggle('active', name === 'register');
  showMessage('');
}

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => { await login(e.target); e.target.reset(); render(); });
});
$('#register-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => { await register(e.target); e.target.reset(); render(); });
});
$('#add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(() => addTask(e.target));
});
$('#logout').addEventListener('click', () => { clearSession(); tasks = []; render(); showMessage('Oled välja logitud.', true); });

render();
