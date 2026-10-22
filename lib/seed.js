// Datos de prueba: 2 salas, 4 instructoras, 46 clases de 8 plazas (lunes a sábado de la semana
// siguiente a hoy) y 12 socias con el bono en distintos puntos.
import { MONTHLY_CLASSES, monthOf, toLocalIso } from './rules.js';

const ROOMS = ['Sala 1', 'Sala 2'];
const INSTRUCTORS = ['Alba Moreno', 'Irene Castro', 'Noelia Vidal', 'Sara Ortega'];
const WEEKDAY_SLOTS = ['08:00', '10:00', '18:00', '19:30'];
const SATURDAY_SLOTS = ['09:00', '10:30', '12:00'];
const DURATION_MIN = 50;

const MEMBERS = [
  'Ana García', 'Beatriz López', 'Clara Martín', 'Diana Sánchez', 'Eva Romero', 'Fátima Navarro',
  'Gloria Torres', 'Helena Gil', 'Inés Serrano', 'Julia Molina', 'Laura Delgado', 'María Herrera',
];

// [día (0 = lunes), hora, sala (0 | 1), socias con plaza, lista de espera en orden]
const SEED_BOOKINGS = [
  [0, '19:30', 0, [0, 1, 2, 3, 4, 5, 6, 7], [8, 9]],
  [1, '18:00', 1, [0, 2, 4, 6, 8, 10, 11], []],
  [2, '10:00', 0, [1, 3, 5], []],
  [3, '18:00', 0, [2, 3, 4, 6, 7, 8, 10, 11], [0]],
  [4, '08:00', 1, [9, 11], []],
  [5, '10:30', 0, [1, 2, 5, 10], []],
];

// Clases que le quedan a cada socia en el mes de la semana de prueba, contando las reservas de
// arriba; el resto se da por gastado en clases anteriores del mes.
const TARGET_REMAINING = [4, 0, 2, 1, 3, 1, 5, 6, 3, 0, 2, 4];

function nextMonday(from) {
  const monday = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
  return monday;
}

const classId = (start, roomIndex) => `c-${start.slice(0, 10)}-${start.slice(11, 16).replace(':', '')}-s${roomIndex + 1}`;

export function createSeed(today = new Date()) {
  const monday = nextMonday(today);
  const classes = [];
  for (let day = 0; day < 6; day++) {
    const slots = day < 5 ? WEEKDAY_SLOTS : SATURDAY_SLOTS;
    slots.forEach((time, slot) => {
      ROOMS.forEach((room, roomIndex) => {
        const [h, m] = time.split(':').map(Number);
        const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day, h, m);
        const end = new Date(start.getTime() + DURATION_MIN * 60_000);
        classes.push({
          id: classId(toLocalIso(start), roomIndex),
          start: toLocalIso(start),
          end: toLocalIso(end),
          room,
          instructor: INSTRUCTORS[(slot * 2 + roomIndex + day) % INSTRUCTORS.length],
        });
      });
    });
  }

  const members = MEMBERS.map((name, i) => ({ id: `m${i + 1}`, name, usedBefore: {} }));
  const createdAt = toLocalIso(today);
  const bookings = [];
  let seq = 0;
  const add = (cls, memberIndex, status) => {
    seq += 1;
    bookings.push({ id: `b${seq}`, seq, classId: cls.id, memberId: members[memberIndex].id, status, createdAt });
  };
  for (const [day, time, roomIndex, confirmed, waitlist] of SEED_BOOKINGS) {
    const date = toLocalIso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day)).slice(0, 10);
    const cls = classes.find((c) => c.id === `c-${date}-${time.replace(':', '')}-s${roomIndex + 1}`);
    confirmed.forEach((i) => add(cls, i, 'confirmed'));
    waitlist.forEach((i) => add(cls, i, 'waitlist'));
  }

  const month = monthOf(classes[0].start);
  members.forEach((member, i) => {
    const booked = bookings.filter(
      (b) => b.memberId === member.id && b.status === 'confirmed' && monthOf(classes.find((c) => c.id === b.classId).start) === month,
    ).length;
    member.usedBefore[month] = Math.max(0, MONTHLY_CLASSES - TARGET_REMAINING[i] - booked);
  });

  return {
    createdAt,
    demoNow: null,
    seq,
    owner: { id: 'owner', name: 'Dueña' },
    members,
    classes,
    bookings,
    notices: [],
  };
}
