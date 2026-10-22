const app = document.getElementById('app');
const userSelect = document.getElementById('user-select');
const clockInput = document.getElementById('clock-input');
const dialog = document.getElementById('confirm');
const toastEl = document.getElementById('toast');

const dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'long' });
const HOUR = 60 * 60 * 1000;

let users = null;
let userId = null;
let clock = null;
let view = null;

const storage = {
  get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* sin almacenamiento */ } },
};

const esc = (text) => String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const time = (localIso) => localIso.slice(11, 16);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Algo ha fallado.');
  return data;
}

let toastTimer;
function toast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4000);
}

function groupByDay(classes) {
  const days = new Map();
  for (const cls of classes) {
    const date = cls.start.slice(0, 10);
    if (!days.has(date)) days.set(date, []);
    days.get(date).push(cls);
  }
  return [...days].map(([date, list]) => ({
    date,
    label: dayFmt.format(new Date(`${date}T00:00`)),
    list: list.sort((a, b) => a.start.localeCompare(b.start) || a.room.localeCompare(b.room)),
  }));
}

function weekTitle(classes) {
  const first = new Date(classes[0].start);
  const last = new Date(classes[classes.length - 1].start);
  const sameMonth = first.getMonth() === last.getMonth();
  return `Semana del ${first.getDate()}${sameMonth ? '' : ` de ${monthFmt.format(first)}`} al ${last.getDate()} de ${monthFmt.format(last)}`;
}

const seats = (taken, capacity) =>
  `<span class="seats" aria-label="${taken} de ${capacity} plazas ocupadas">${Array.from({ length: capacity }, (_, i) => `<i class="${i < taken ? 'on' : ''}"></i>`).join('')}</span>`;
const chip = (text, tone) => `<span class="chip chip-${tone}">${esc(text)}</span>`;
const button = (action, cls, label, style, disabled = false) =>
  `<button type="button" class="btn-${style}" data-action="${action}" data-class-id="${cls.id}" ${disabled ? 'disabled' : ''}>${esc(label)}</button>`;

function weekGrid(classes, card) {
  return `<div class="week">${groupByDay(classes)
    .map((day) => `<section class="day"><h2>${esc(day.label)}</h2><div class="day-list">${day.list.map(card).join('')}</div></section>`)
    .join('')}</div>`;
}

// ---------- Socia ----------

function memberCard(cls) {
  const full = cls.confirmed >= cls.capacity;
  const remaining = view.bono.find((b) => b.month === cls.start.slice(0, 7))?.remaining ?? 0;
  let status = '';
  let action = '';
  if (cls.mine === 'confirmed') {
    status = chip(cls.fromWaitlist ? 'Reservada · desde la lista' : 'Reservada', 'ok');
    if (!cls.started) action = button('cancel', cls, 'Cancelar reserva', 'ghost');
  } else if (cls.mine === 'waitlist') {
    status = chip(`En lista de espera · puesto ${cls.position}`, 'wait');
    if (!cls.started) action = button('leave', cls, 'Salir de la lista', 'ghost');
  } else if (cls.started) {
    status = chip('Ya empezó', 'muted');
  } else if (full) {
    status = chip(`Llena${cls.waiting ? ` · ${cls.waiting} en espera` : ''}`, 'warn');
    action = remaining ? button('book', cls, 'Apuntarme a la lista', 'secondary') : button('book', cls, 'Sin clases en el bono', 'secondary', true);
  } else {
    action = remaining ? button('book', cls, 'Reservar', 'primary') : button('book', cls, 'Sin clases en el bono', 'primary', true);
  }
  return `<article class="class-card ${cls.mine ? `is-${cls.mine}` : ''} ${cls.started ? 'is-past' : ''} ${full ? 'is-full' : ''}">
    <div class="time">${time(cls.start)}<span>– ${time(cls.end)}</span></div>
    <p class="meta">${esc(cls.room)} · ${esc(cls.instructor)}</p>
    <div class="occupancy">${seats(cls.confirmed, cls.capacity)}<span>${cls.confirmed}/${cls.capacity}</span></div>
    ${status}${action}
  </article>`;
}

function renderMember() {
  const bono = view.bono
    .map((b) => `<div class="bono ${b.remaining === 0 ? 'is-empty' : b.remaining === 1 ? 'is-low' : ''}">
        <b>${b.remaining}</b><span>de ${b.total} clases<br>bono de ${esc(b.label)}</span>
      </div>`)
    .join('');
  const notices = view.notices
    .map((n) => `<div class="notice ${n.tone === 'warn' ? 'warn' : ''}"><p>${esc(n.text)}</p></div>`)
    .join('');
  const empty = view.bono.every((b) => b.remaining === 0);
  app.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Hola, ${esc(view.member.name.split(' ')[0])}</h1>
        <p class="sub">${esc(weekTitle(view.classes))} · Cancela con 12 horas o más de antelación y la clase vuelve a tu bono.</p>
      </div>
      <div class="bonos">${bono}</div>
    </div>
    ${notices ? `<div class="notices">${notices}<button type="button" class="btn-ghost" data-action="seen">Entendido</button></div>` : ''}
    ${empty ? '<div class="notice warn"><p>No te quedan clases este mes: no puedes reservar ni apuntarte a listas de espera.</p></div>' : ''}
    ${weekGrid(view.classes, memberCard)}`;
}

// ---------- Dueña ----------

function ownerCard(cls) {
  const taken = cls.confirmed.length;
  const level = taken >= view.capacity ? 'is-full' : taken === 0 ? 'is-empty' : '';
  const names = taken
    ? `<details><summary>Ver socias</summary><ol>${cls.confirmed.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>${
        cls.waiting.length ? `<p class="list-label">Lista de espera</p><ol>${cls.waiting.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>` : ''
      }</details>`
    : '<p class="meta">Sin reservas</p>';
  return `<article class="class-card owner ${level} ${cls.started ? 'is-past' : ''}">
    <div class="time">${time(cls.start)}<span>– ${time(cls.end)}</span></div>
    <p class="meta">${esc(cls.room)} · ${esc(cls.instructor)}</p>
    <div class="occupancy">${seats(taken, view.capacity)}<span>${taken}/${view.capacity}${cls.waiting.length ? ` · ${cls.waiting.length} en espera` : ''}</span></div>
    ${names}
  </article>`;
}

function renderOwner() {
  const taken = view.classes.reduce((sum, c) => sum + c.confirmed.length, 0);
  const total = view.classes.length * view.capacity;
  const full = view.classes.filter((c) => c.confirmed.length >= view.capacity).length;
  const waiting = view.classes.reduce((sum, c) => sum + c.waiting.length, 0);
  const low = view.lowBalance.length
    ? `<ul class="low-list">${view.lowBalance
        .map((m) => `<li><span>${esc(m.name)}</span><span class="chip ${m.remaining === 0 ? 'chip-warn' : 'chip-wait'}">${plural(m.remaining, 'clase', 'clases')}</span></li>`)
        .join('')}</ul>`
    : '<p class="meta">Ninguna socia tiene 1 o 0 clases.</p>';
  app.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Ocupación</h1>
        <p class="sub">${esc(weekTitle(view.classes))}</p>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><b>${Math.round((taken / total) * 100)}%</b><span>${taken} de ${total} plazas ocupadas</span></div>
      <div class="stat"><b>${full}</b><span>clases llenas de ${view.classes.length}</span></div>
      <div class="stat"><b>${waiting}</b><span>${waiting === 1 ? 'socia' : 'socias'} en lista de espera</span></div>
    </div>
    <div class="owner-layout">
      <aside class="panel">
        <h2>Socias con 1 o 0 clases</h2>
        <p class="meta">Bono de ${esc(view.monthLabel)}</p>
        ${low}
      </aside>
      ${weekGrid(view.classes, ownerCard)}
    </div>`;
}

// ---------- Carga y acciones ----------

async function render() {
  try {
    clock = await api('/api/clock');
    clockInput.value = clock.now;
    clockInput.classList.toggle('is-demo', clock.demo);
    if (userId === 'owner') {
      view = await api('/api/owner');
      renderOwner();
    } else {
      view = await api(`/api/week?member=${encodeURIComponent(userId)}`);
      renderMember();
    }
  } catch (error) {
    app.innerHTML = `<div class="notice warn"><p>${esc(error.message)}</p></div>`;
  }
}

function askCancel(cls) {
  const hoursLeft = (new Date(cls.start) - new Date(clock.now)) / HOUR;
  let text;
  if (!cls.refundable) text = 'Faltan menos de 12 horas: si cancelas, pierdes esta clase del bono.';
  else if (hoursLeft < 12) text = 'Entraste desde la lista de espera con menos de 12 horas de margen: la clase vuelve a tu bono.';
  else text = 'Faltan 12 horas o más: la clase vuelve a tu bono.';
  if (cls.waiting) text += ' La plaza pasará a la primera de la lista de espera.';
  document.getElementById('confirm-title').textContent = `¿Cancelar la clase de las ${time(cls.start)}?`;
  document.getElementById('confirm-text').textContent = text;
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.returnValue = '';
    dialog.showModal();
  });
}

app.addEventListener('click', async (event) => {
  const target = event.target.closest('button[data-action]');
  if (!target) return;
  const { action, classId } = target.dataset;
  const cls = view.classes?.find((c) => c.id === classId);
  try {
    if (action === 'seen') {
      await api('/api/notices/seen', { memberId: userId });
    } else if (action === 'book') {
      const result = await api('/api/book', { memberId: userId, classId });
      toast(result.status === 'confirmed'
        ? `Reserva hecha. Te ${result.remaining === 1 ? 'queda' : 'quedan'} ${plural(result.remaining, 'clase', 'clases')} este mes.`
        : `La clase está llena: estás en la lista de espera, puesto ${result.position}. No se descuenta nada hasta que entres.`);
    } else if (action === 'cancel') {
      if (!(await askCancel(cls))) return;
      const result = await api('/api/cancel', { memberId: userId, classId });
      toast(result.refunded ? 'Reserva cancelada: la clase vuelve a tu bono.' : 'Reserva cancelada: la clase se pierde (menos de 12 horas).');
    } else if (action === 'leave') {
      await api('/api/leave-waitlist', { memberId: userId, classId });
      toast('Has salido de la lista de espera.');
    }
  } catch (error) {
    toast(error.message, true);
  }
  render();
});

userSelect.addEventListener('change', () => {
  userId = userSelect.value;
  storage.set('np-user', userId);
  render();
});

clockInput.addEventListener('change', async () => {
  if (!clockInput.value) return;
  await api('/api/clock', { now: clockInput.value });
  toast('Reloj de la demo cambiado: la app se comporta como si fuera esa hora.');
  render();
});

document.getElementById('clock-real').addEventListener('click', async () => {
  await api('/api/clock', { now: null });
  render();
});

document.getElementById('reset').addEventListener('click', async () => {
  await api('/api/reset', {});
  toast('Datos de prueba recargados.');
  render();
});

async function init() {
  users = await api('/api/users');
  userSelect.innerHTML = `<optgroup label="Socias">${users.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</optgroup>
    <optgroup label="Estudio"><option value="${users.owner.id}">${esc(users.owner.name)}</option></optgroup>`;
  const saved = storage.get('np-user');
  userId = [users.owner, ...users.members].some((u) => u.id === saved) ? saved : users.members[0].id;
  userSelect.value = userId;
  render();
}

init();
