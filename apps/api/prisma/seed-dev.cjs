/*
 * Демо-аккаунты Union для локальной отладки: пароль + анкета + публичные фото.
 * Запуск: pnpm --filter @vedamatch/api seed:dev
 *
 * Фотографии не грузятся в S3 — в storageKey кладётся готовый URL из
 * apps/web/public/mock/union (см. apps/web/scripts/generate-mock-photos.mjs),
 * который UserGalleryService отдаёт без подписи.
 */
const { PrismaClient } = require('@prisma/client');
const { randomBytes, scryptSync } = require('node:crypto');

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'vedamatch';
const PHOTOS_PER_PERSON = 3;

/** Дата рождения по нужному возрасту, чтобы демо-данные не устаревали. */
function birthDateForAge(age) {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear() - age, now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Формат совпадает с apps/api/src/modules/auth/password.ts */
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

const cities = {
  moscow: { city: 'Москва', country: 'Россия', lat: 55.7558, lon: 37.6173 },
  spb: {
    city: 'Санкт-Петербург',
    country: 'Россия',
    lat: 59.9311,
    lon: 30.3609,
  },
  krasnodar: {
    city: 'Краснодар',
    country: 'Россия',
    lat: 45.0355,
    lon: 38.9753,
  },
  kazan: { city: 'Казань', country: 'Россия', lat: 55.7963, lon: 49.1088 },
  novosibirsk: {
    city: 'Новосибирск',
    country: 'Россия',
    lat: 55.0084,
    lon: 82.9357,
  },
  ekb: {
    city: 'Екатеринбург',
    country: 'Россия',
    lat: 56.8389,
    lon: 60.6057,
  },
  almaty: { city: 'Алматы', country: 'Казахстан', lat: 43.222, lon: 76.8512 },
  tbilisi: { city: 'Тбилиси', country: 'Грузия', lat: 41.7151, lon: 44.8271 },
  mayapur: { city: 'Маяпур', country: 'Индия', lat: 23.4241, lon: 88.3888 },
  vrindavan: {
    city: 'Вриндаван',
    country: 'Индия',
    lat: 27.5806,
    lon: 77.7006,
  },
  riga: { city: 'Рига', country: 'Латвия', lat: 56.9496, lon: 24.1052 },
  belgrade: { city: 'Белград', country: 'Сербия', lat: 44.7866, lon: 20.4489 },
};

const people = [
  {
    slug: 'radha',
    photoVerified: true,
    lastSeenMinutesAgo: 3,
    age: 29,
    name: 'Радха',
    gender: 'female',
    stage: 'devotee',
    location: cities.moscow,
    intentions: { family: 60, friendship: 20, service: 20 },
    about:
      'Практикую 12 лет, служу на кухне в храме. Ищу спутника жизни, для которого практика — не хобби, а основа дня.',
    languages: ['русский', 'английский'],
    skills: ['кухня / прасад', 'организация мероприятий'],
    interests: ['киртан', 'семья', 'ведическая культура', 'паломничества'],
    values: ['духовное развитие', 'семья', 'верность', 'чистота'],
    familyStatus: 'свободен / свободна',
    format: 'offline',
    relocationReady: true,
  },
  {
    slug: 'govinda',
    photoVerified: true,
    lastSeenMinutesAgo: 40,
    age: 34,
    name: 'Говинда',
    gender: 'male',
    stage: 'devotee',
    location: cities.spb,
    intentions: { family: 50, service: 30, friendship: 20 },
    about:
      'Программист и киртания. Хочу построить семью на основе совместной практики и служения общине.',
    languages: ['русский', 'английский', 'санскрит'],
    skills: ['программирование', 'музыка / киртан'],
    interests: ['философия', 'киртан', 'служение', 'образование'],
    values: ['духовное развитие', 'честность', 'служение', 'община'],
    familyStatus: 'свободен / свободна',
    format: 'any',
    relocationReady: true,
  },
  {
    slug: 'tulasi',
    photoVerified: true,
    lastSeenMinutesAgo: 2,
    age: 31,
    name: 'Туласи',
    gender: 'female',
    stage: 'yogi',
    location: cities.krasnodar,
    intentions: { family: 40, friendship: 30, service: 30 },
    about:
      'Преподаю йогу и аюрведу. Люблю сад, простую жизнь и утренние практики.',
    languages: ['русский', 'английский'],
    skills: ['преподавание', 'сад / ферма', 'медицина / здоровье'],
    interests: ['йога', 'аюрведа', 'экология', 'здоровый образ жизни'],
    values: ['простота', 'осознанность', 'чистота', 'забота о людях'],
    familyStatus: 'свободен / свободна',
    format: 'offline',
    relocationReady: false,
  },
  {
    slug: 'nitai',
    lastSeenMinutesAgo: 4000,
    age: 41,
    name: 'Нитай',
    gender: 'male',
    stage: 'practitioner',
    location: cities.kazan,
    intentions: { business: 50, friendship: 30, service: 20 },
    about:
      'Строю экопоселение под Казанью. Ищу партнёров в проект и единомышленников.',
    languages: ['русский'],
    skills: ['строительство', 'управление проектами', 'фандрайзинг'],
    interests: ['экология', 'бизнес', 'служение', 'ведическая культура'],
    values: ['ответственность', 'развитие проектов', 'община', 'честность'],
    familyStatus: 'женат / замужем',
    format: 'any',
    relocationReady: false,
  },
  {
    slug: 'yamuna',
    photoVerified: true,
    lastSeenMinutesAgo: 300,
    age: 36,
    name: 'Ямуна',
    gender: 'female',
    stage: 'practitioner',
    location: cities.novosibirsk,
    intentions: { family: 45, friendship: 35, service: 20 },
    about:
      'Психолог, веду группы поддержки. Ценю глубокие разговоры и честность.',
    languages: ['русский', 'английский'],
    skills: ['наставничество', 'преподавание'],
    interests: ['психология', 'философия', 'медитация', 'чтение'],
    values: ['честность', 'доброта', 'осознанность', 'уважение'],
    familyStatus: 'разведен / разведена',
    format: 'any',
    relocationReady: true,
  },
  {
    slug: 'madhava',
    lastSeenMinutesAgo: 20000,
    age: 38,
    name: 'Мадхава',
    gender: 'male',
    stage: 'yogi',
    location: cities.ekb,
    intentions: { service: 45, business: 30, friendship: 25 },
    about:
      'Снимаю документальные фильмы о ведической культуре. Ищу команду для нового проекта.',
    languages: ['русский', 'английский'],
    skills: ['видео / монтаж', 'копирайтинг', 'SMM'],
    interests: ['творчество', 'ведическая культура', 'путешествия', 'музыка'],
    values: ['развитие проектов', 'служение', 'осознанность'],
    familyStatus: 'свободен / свободна',
    format: 'online',
    relocationReady: true,
  },
  {
    slug: 'lalita',
    lastSeenMinutesAgo: 8,
    age: 26,
    name: 'Лалита',
    gender: 'female',
    stage: 'devotee',
    location: cities.almaty,
    intentions: { family: 55, service: 25, friendship: 20 },
    about:
      'Веду детскую воскресную школу. Мечтаю о большой дружной семье в общине преданных.',
    languages: ['русский', 'английский', 'хинди'],
    skills: ['преподавание', 'организация курсов', 'кухня / прасад'],
    interests: ['семья', 'образование', 'киртан', 'служение'],
    values: ['семья', 'доброта', 'духовное развитие', 'совместная практика'],
    familyStatus: 'свободен / свободна',
    format: 'offline',
    relocationReady: true,
  },
  {
    slug: 'vrinda',
    lastSeenMinutesAgo: 1200,
    age: 23,
    name: 'Вринда',
    gender: 'female',
    stage: 'seeker',
    location: cities.tbilisi,
    intentions: { friendship: 50, family: 30, business: 20 },
    about:
      'Недавно начала практиковать, ищу друзей и наставников, с кем можно расти.',
    languages: ['русский', 'английский'],
    skills: ['дизайн', 'маркетинг'],
    interests: ['йога', 'путешествия', 'творчество', 'медитация'],
    values: ['осознанность', 'доброта', 'уважение'],
    familyStatus: 'свободен / свободна',
    format: 'any',
    relocationReady: true,
  },
  {
    slug: 'arjuna',
    lastSeenMinutesAgo: 5000,
    age: 45,
    name: 'Арджуна',
    gender: 'male',
    stage: 'practitioner',
    location: cities.mayapur,
    intentions: { service: 50, friendship: 30, business: 20 },
    about:
      'Живу в Маяпуре, служу в отделе гостеприимства. Помогаю паломникам с организацией поездок.',
    languages: ['русский', 'английский', 'бенгали'],
    skills: ['администрирование', 'организация мероприятий', 'переводы'],
    interests: ['паломничества', 'служение', 'ведическая культура'],
    values: ['служение', 'простота', 'община'],
    familyStatus: 'монах / монахиня',
    format: 'offline',
    relocationReady: false,
  },
  {
    slug: 'sita',
    lastSeenMinutesAgo: 120,
    age: 28,
    name: 'Сита',
    gender: 'female',
    stage: 'devotee',
    // Заявка ещё у администрации — значка «Проверен» быть не должно.
    verification: 'awaiting_admin',
    location: cities.vrindavan,
    intentions: { family: 50, friendship: 25, service: 25 },
    about:
      'Живу во Вриндаване, изучаю священные тексты. Ищу серьёзные отношения с преданным.',
    languages: ['русский', 'английский', 'хинди', 'санскрит'],
    skills: ['переводы', 'наставничество'],
    interests: ['философия', 'паломничества', 'чтение', 'семья'],
    values: ['духовное развитие', 'верность', 'чистота', 'простота'],
    familyStatus: 'свободен / свободна',
    format: 'any',
    relocationReady: true,
  },
  {
    slug: 'kesava',
    lastSeenMinutesAgo: 30000,
    age: 47,
    name: 'Кешава',
    gender: 'male',
    stage: 'yogi',
    location: cities.riga,
    intentions: { business: 45, service: 30, friendship: 25 },
    about:
      'Аюрведический врач, открываю центр здоровья. Ищу партнёров и специалистов.',
    languages: ['русский', 'английский', 'немецкий'],
    skills: ['медицина / здоровье', 'управление проектами'],
    interests: ['аюрведа', 'здоровый образ жизни', 'бизнес', 'образование'],
    values: ['ответственность', 'забота о людях', 'развитие проектов'],
    familyStatus: 'женат / замужем',
    format: 'any',
    relocationReady: false,
  },
  {
    slug: 'devaki',
    lastSeenMinutesAgo: 60,
    age: 33,
    name: 'Деваки',
    gender: 'female',
    stage: 'practitioner',
    location: cities.belgrade,
    intentions: { family: 40, friendship: 40, service: 20 },
    about:
      'Переехала в Белград, ищу общину и близких по духу людей. Пеку прасад на праздники.',
    languages: ['русский', 'английский', 'французский'],
    skills: ['кулинария', 'волонтёрство'],
    interests: ['ретриты', 'киртан', 'семья', 'творчество'],
    values: ['община', 'доброта', 'совместная практика'],
    familyStatus: 'свободен / свободна',
    format: 'offline',
    relocationReady: true,
  },
];

function photosFor(slug) {
  return Array.from({ length: PHOTOS_PER_PERSON }, (_, index) => ({
    storageKey: `/mock/union/${slug}-${index + 1}.svg`,
    sizeBytes: 4096,
    width: 600,
    height: 750,
    isPublic: true,
    sortOrder: index,
  }));
}

async function seedPerson(person) {
  const email = `${person.slug}@demo.vedamatch.local`;
  const passwordHash = hashPassword(DEMO_PASSWORD);
  const userData = {
    name: person.name,
    isDemo: true,
    passwordHash,
    spiritualStage: person.stage,
    birthDate: birthDateForAge(person.age),
    // Демо-администратору пол не задаём — нужен профиль без пола,
    // чтобы было видно поведение фильтра на таких аккаунтах.
    gender: person.gender ?? null,
    // Разная давность визитов, чтобы было видно все уровни активности.
    lastSeenAt: new Date(Date.now() - (person.lastSeenMinutesAgo ?? 5) * 60_000),
    // Часть демо-аккаунтов с проверенными фото — чтобы был виден второй значок.
    photoVerifiedAt: person.photoVerified ? new Date() : null,
    // Значок «Проверен» получают только преданные со статусом confirmed.
    devoteeVerificationStatus:
      person.stage === 'devotee'
        ? (person.verification ?? 'confirmed')
        : null,
    homeLocation: person.location,
    messengers: { telegram: `@${person.slug}_demo` },
    socialLinks: {},
  };

  const user = await prisma.user.upsert({
    where: { email },
    update: userData,
    create: { email, ...userData },
  });

  await prisma.userPhoto.deleteMany({ where: { userId: user.id } });
  await prisma.userPhoto.createMany({
    data: photosFor(person.slug).map((photo) => ({ ...photo, userId: user.id })),
  });

  const profileData = {
    about: person.about,
    relocationReady: person.relocationReady,
    format: person.format,
    languages: person.languages,
    skills: person.skills,
    interests: person.interests,
    values: person.values,
    familyStatus: person.familyStatus,
    privacy: { photo: 'everyone', city: 'everyone', contacts: 'after_match' },
    isActive: true,
  };

  const profile = await prisma.unionProfile.upsert({
    where: { userId: user.id },
    update: profileData,
    create: { userId: user.id, ...profileData },
  });

  await prisma.unionIntention.deleteMany({ where: { profileId: profile.id } });
  await prisma.unionIntention.createMany({
    data: Object.entries(person.intentions).map(([type, weight]) => ({
      profileId: profile.id,
      type,
      weight,
    })),
  });

  return email;
}

/** Демо-администратор для разбора жалоб и подтверждения преданных. */
async function seedAdmin() {
  const email = 'admin@demo.vedamatch.local';
  const data = {
    name: 'Демо-администратор',
    isDemo: true,
    role: 'admin',
    passwordHash: hashPassword(DEMO_PASSWORD),
    lastSeenAt: new Date(),
  };
  await prisma.user.upsert({
    where: { email },
    update: data,
    create: { email, ...data },
  });
  return email;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed:dev нельзя запускать в production');
  }

  for (const person of people) {
    const email = await seedPerson(person);
    console.log(`  ${person.name.padEnd(10)} ${email}`);
  }
  const adminEmail = await seedAdmin();
  console.log(`  ${'Админ'.padEnd(10)} ${adminEmail}`);
  console.log(
    `\nСоздано демо-аккаунтов: ${people.length + 1}. Пароль у всех: ${DEMO_PASSWORD}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
