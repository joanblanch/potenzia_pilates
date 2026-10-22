// Reglas de reserva de Núcleo Pilates. Todas las funciones trabajan sobre el estado en memoria
// y reciben la hora actual, para poder probarlas y para el reloj de la demo.

export const CAPACITY = 8;
export const MONTHLY_CLASSES = 8;
export const REFUND_WINDOW_MS = 12 * 60 * 60 * 1000;

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dayFormat = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

export class RuleError extends Error {}

export const monthOf = (localIso) => localIso.slice(0, 7);
export const monthLabel = (month) => MONTHS[Number(month.slice(5, 7)) - 1];
const toDate = (localIso) => new Date(localIso);

export function toLocalIso(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

export const describeClass = (cls) => `${dayFormat.format(toDate(cls.start))} a las ${cls.start.slice(11, 16)} (${cls.room})`;

function findClass(state, classId) {
  const cls = state.classes.find((c) => c.id === classId);
  if (!cls) throw new RuleError('Esa clase no existe.');
  return cls;
}

function findMember(state, memberId) {
  const member = state.members.find((m) => m.id === memberId);
  if (!member) throw new RuleError('Esa socia no existe.');
  return member;
}

// Gastan bono las reservas en pie y las canceladas con menos de 12 horas.
const spendsClass = (b) => b.status === 'confirmed' || b.status === 'lost';

export function remaining(state, memberId, month) {
  const member = findMember(state, memberId);
  const spent = state.bookings.filter(
    (b) => b.memberId === memberId && spendsClass(b) && monthOf(findClass(state, b.classId).start) === month,
  ).length;
  return Math.max(0, MONTHLY_CLASSES - (member.usedBefore?.[month] ?? 0) - spent);
}

const confirmedIn = (state, classId) => state.bookings.filter((b) => b.classId === classId && b.status === 'confirmed');
const waitlistOf = (state, classId) =>
  state.bookings.filter((b) => b.classId === classId && b.status === 'waitlist').sort((a, b) => a.seq - b.seq);
const activeBooking = (state, memberId, classId) =>
  state.bookings.find(
    (b) => b.memberId === memberId && b.classId === classId && (b.status === 'confirmed' || b.status === 'waitlist'),
  );

function overlaps(state, memberId, cls) {
  const start = toDate(cls.start);
  const end = toDate(cls.end);
  return state.bookings.some((b) => {
    if (b.memberId !== memberId || b.status !== 'confirmed' || b.classId === cls.id) return false;
    const other = findClass(state, b.classId);
    return toDate(other.start) < end && start < toDate(other.end);
  });
}

function nextSeq(state) {
  state.seq = (state.seq ?? 0) + 1;
  return state.seq;
}

function addBooking(state, fields, now) {
  const seq = nextSeq(state);
  const booking = { id: `b${seq}`, seq, createdAt: toLocalIso(now), ...fields };
  state.bookings.push(booking);
  return booking;
}

function notify(state, memberId, text, tone, now) {
  const seq = nextSeq(state);
  state.notices.push({ id: `n${seq}`, memberId, text, tone, createdAt: toLocalIso(now), seen: false });
}

// Reservar una clase llena apunta a la lista de espera. Hace falta tener al menos 1 clase en el
// bono del mes de la clase, también para la lista (el descuento llega al entrar en la plaza).
export function book(state, memberId, classId, now) {
  findMember(state, memberId);
  const cls = findClass(state, classId);
  if (now >= toDate(cls.start)) throw new RuleError('Esta clase ya ha empezado.');
  const current = activeBooking(state, memberId, classId);
  if (current) {
    throw new RuleError(current.status === 'confirmed' ? 'Ya tienes esta clase reservada.' : 'Ya estás en la lista de espera de esta clase.');
  }
  const month = monthOf(cls.start);
  if (remaining(state, memberId, month) < 1) throw new RuleError(`No te quedan clases en el bono de ${monthLabel(month)}.`);
  if (overlaps(state, memberId, cls)) throw new RuleError('Ya tienes otra clase a esa hora.');

  if (confirmedIn(state, classId).length < CAPACITY) {
    addBooking(state, { classId, memberId, status: 'confirmed' }, now);
    return { status: 'confirmed', remaining: remaining(state, memberId, month) };
  }
  addBooking(state, { classId, memberId, status: 'waitlist' }, now);
  return { status: 'waitlist', position: waitlistOf(state, classId).length };
}

// Se recupera la clase si faltan 12 horas o más, o si la socia entró desde la lista de espera
// con menos de 12 horas de margen.
export function isRefundable(booking, cls, now) {
  const start = toDate(cls.start);
  if (start - now >= REFUND_WINDOW_MS) return true;
  return Boolean(booking.promotedAt) && start - toDate(booking.promotedAt) < REFUND_WINDOW_MS;
}

export function cancel(state, memberId, classId, now) {
  const cls = findClass(state, classId);
  const booking = activeBooking(state, memberId, classId);
  if (!booking || booking.status !== 'confirmed') throw new RuleError('No tienes esta clase reservada.');
  if (now >= toDate(cls.start)) throw new RuleError('La clase ya ha empezado: no se puede cancelar.');

  const refunded = isRefundable(booking, cls, now);
  booking.status = refunded ? 'cancelled' : 'lost';
  booking.cancelledAt = toLocalIso(now);
  promoteFromWaitlist(state, cls, now);
  return { refunded, remaining: remaining(state, memberId, monthOf(cls.start)) };
}

export function leaveWaitlist(state, memberId, classId, now) {
  const booking = activeBooking(state, memberId, classId);
  if (!booking || booking.status !== 'waitlist') throw new RuleError('No estás en la lista de espera de esta clase.');
  booking.status = 'left';
  booking.cancelledAt = toLocalIso(now);
  return { left: true };
}

// La plaza libre pasa a la primera de la lista que pueda ocuparla. A quien ya no tiene clases
// en el bono o tiene otra clase a esa hora se la saca de la lista y se le avisa.
function promoteFromWaitlist(state, cls, now) {
  const month = monthOf(cls.start);
  const when = describeClass(cls);
  for (const next of waitlistOf(state, cls.id)) {
    if (confirmedIn(state, cls.id).length >= CAPACITY) break;
    if (remaining(state, next.memberId, month) < 1) {
      next.status = 'removed';
      notify(state, next.memberId, `Se liberó una plaza en la clase del ${when}, pero no te quedan clases en el bono de ${monthLabel(month)}. Has salido de la lista de espera.`, 'warn', now);
      continue;
    }
    if (overlaps(state, next.memberId, cls)) {
      next.status = 'removed';
      notify(state, next.memberId, `Se liberó una plaza en la clase del ${when}, pero ya tienes otra clase a esa hora. Has salido de la lista de espera.`, 'warn', now);
      continue;
    }
    next.status = 'confirmed';
    next.promotedAt = toLocalIso(now);
    notify(state, next.memberId, `¡Tienes plaza! Has pasado de la lista de espera a la clase del ${when}. Se ha descontado 1 clase de tu bono.`, 'ok', now);
  }
}

export function markNoticesSeen(state, memberId) {
  for (const notice of state.notices) if (notice.memberId === memberId) notice.seen = true;
  return { ok: true };
}

export const weekMonth = (state) => monthOf(state.classes[0].start);

export function memberView(state, memberId, now) {
  const member = findMember(state, memberId);
  const months = [...new Set(state.classes.map((c) => monthOf(c.start)))];
  return {
    member: { id: member.id, name: member.name },
    bono: months.map((month) => ({ month, label: monthLabel(month), remaining: remaining(state, memberId, month), total: MONTHLY_CLASSES })),
    notices: state.notices.filter((n) => n.memberId === memberId && !n.seen),
    classes: state.classes.map((cls) => {
      const mine = activeBooking(state, memberId, cls.id);
      const waitlist = waitlistOf(state, cls.id);
      return {
        ...cls,
        capacity: CAPACITY,
        confirmed: confirmedIn(state, cls.id).length,
        waiting: waitlist.length,
        started: now >= toDate(cls.start),
        mine: mine?.status ?? null,
        position: mine?.status === 'waitlist' ? waitlist.indexOf(mine) + 1 : null,
        fromWaitlist: mine?.status === 'confirmed' && Boolean(mine.promotedAt),
        refundable: mine?.status === 'confirmed' ? isRefundable(mine, cls, now) : null,
      };
    }),
  };
}

export function ownerView(state, now) {
  const month = weekMonth(state);
  const nameOf = (id) => findMember(state, id).name;
  return {
    month,
    monthLabel: monthLabel(month),
    capacity: CAPACITY,
    classes: state.classes.map((cls) => ({
      ...cls,
      started: now >= toDate(cls.start),
      confirmed: confirmedIn(state, cls.id).map((b) => nameOf(b.memberId)),
      waiting: waitlistOf(state, cls.id).map((b) => nameOf(b.memberId)),
    })),
    lowBalance: state.members
      .map((m) => ({ id: m.id, name: m.name, remaining: remaining(state, m.id, month) }))
      .filter((m) => m.remaining <= 1)
      .sort((a, b) => a.remaining - b.remaining || a.name.localeCompare(b.name, 'es')),
  };
}
