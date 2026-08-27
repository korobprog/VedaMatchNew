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
    lastSeenAt: new Date(
      Date.now() - (person.lastSeenMinutesAgo ?? 5) * 60_000,
    ),
    // Часть демо-аккаунтов с проверенными фото — чтобы был виден второй значок.
    photoVerifiedAt: person.photoVerified ? new Date() : null,
    // Значок «Проверен» получают только преданные со статусом confirmed.
    devoteeVerificationStatus:
      person.stage === 'devotee' ? (person.verification ?? 'confirmed') : null,
    homeLocation: person.location,
    messengers: { telegram: `@${person.slug}_demo` },
    socialLinks: {},
    // Рассказ и языки живут в портальном профиле, а не в анкете сервиса —
    // см. docs/service-module-contract.md.
    about: person.about,
    languages: person.languages,
  };

  const user = await prisma.user.upsert({
    where: { email },
    update: userData,
    create: { email, ...userData },
  });

  await prisma.userPhoto.deleteMany({ where: { userId: user.id } });
  await prisma.userPhoto.createMany({
    data: photosFor(person.slug).map((photo) => ({
      ...photo,
      userId: user.id,
    })),
  });

  const profileData = {
    relocationReady: person.relocationReady,
    format: person.format,
    skills: person.skills,
    interests: person.interests,
    values: person.values,
    familyStatus: person.familyStatus,
    privacy: {
      photo: 'everyone',
      city: 'everyone',
      age: 'everyone',
      contacts: 'after_match',
    },
    isActive: true,
    // Демо-анкеты соглашаются на публичную витрину: иначе страница
    // /services/union в dev пуста и проверить её нечем. Настоящие люди
    // отмечают эту галочку сами, по умолчанию она снята.
    showcaseOptIn: true,
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

/**
 * Демо-переписка сервиса «Общение». Без неё чат в dev — пустой экран, и ни
 * один сценарий (непрочитанное, запрос, группа, канал) нельзя увидеть, не
 * набивая сообщения руками.
 */
const chatScript = {
  /** Личные диалоги: пара людей и их разговор. */
  direct: [
    {
      between: ['govinda', 'radha'],
      messages: [
        ['govinda', 'Харе Кришна! Идёшь в субботу на киртан в центре?', -180],
        ['radha', 'Иду. Начало в 18:00, буду чуть раньше', -175],
        ['govinda', 'Отлично, тогда встретимся у входа', -170, ['🙏']],
        ['radha', 'Возьму караталы и прасад на всех', -20],
      ],
    },
    {
      between: ['madhava', 'tulasi'],
      messages: [
        ['tulasi', 'Прабху, вы ещё отдаёте книги?', -2880],
        [
          'madhava',
          'Да, «Бхагавад-гита» и два тома «Шримад-Бхагаватам»',
          -2870,
        ],
        ['tulasi', 'Заберу в воскресенье после программы', -2860, ['👍']],
      ],
    },
    {
      between: ['arjuna', 'kesava'],
      messages: [
        ['kesava', 'Как проходит утренняя практика?', -600],
        ['arjuna', 'Встаю в 4:30, шестнадцать кругов до завтрака', -590],
        ['kesava', 'Крепко. У меня пока двенадцать', -580],
      ],
    },
  ],
  /** Запросы: первое сообщение незнакомому человеку, ответа ещё нет. */
  requests: [
    {
      from: 'nitai',
      to: 'radha',
      message:
        'Харе Кришна! Видел ваш отклик на объявление о воскресной программе — можно задать пару вопросов?',
    },
    {
      from: 'vrinda',
      to: 'govinda',
      message:
        'Здравствуйте! Подскажете, где в Москве собирается киртан-группа?',
    },
  ],
  /** Группа: несколько участников, ответы и реакции. */
  group: {
    title: 'Киртан-группа · Москва',
    description: 'Репетиции, инструменты, кто что везёт',
    owner: 'govinda',
    members: ['madhava', 'tulasi', 'radha', 'yamuna'],
    messages: [
      ['madhava', 'Мриданги беру на себя, привезу к шести', -1440],
      ['tulasi', 'Тогда я привезу караталы и прасад на всех', -1435, ['🙌']],
      ['govinda', 'Возьму колонку и провода. Кто-нибудь снимет видео?', -1430],
      ['yamuna', 'Сниму, если кто-то подержит штатив', -60],
    ],
  },
  /** Канал общины: пишет только администрация, остальные читают. */
  channel: {
    title: 'Объявления общины',
    description: 'Официальные новости храма',
    owner: 'madhava',
    subscribers: ['radha', 'govinda', 'tulasi', 'nitai', 'arjuna', 'kesava'],
    messages: [
      [
        'madhava',
        'Набор на курс по «Бхагавад-гите». Занятия по средам в 19:00, начало 3 сентября. Запись до 30 августа.',
        -2160,
      ],
      [
        'madhava',
        'Воскресная программа переносится в новый зал: Беговая, 12. Метро — семь минут пешком.',
        -720,
      ],
    ],
  },
};

function minutesAgo(minutes) {
  return new Date(Date.now() + minutes * 60_000);
}

/** id демо-людей по слагу: переписку собираем уже по ним. */
async function demoUserIds() {
  const rows = await prisma.user.findMany({
    where: { email: { endsWith: '@demo.vedamatch.local' } },
    select: { id: true, email: true },
  });
  return Object.fromEntries(
    rows.map((row) => [row.email.split('@')[0], row.id]),
  );
}

async function addMessages(conversationId, messages, ids) {
  let last = null;
  for (const [slug, body, offset, reactions] of messages) {
    const createdAt = minutesAgo(offset);
    const message = await prisma.chatMessage.create({
      data: { conversationId, authorId: ids[slug], body, createdAt },
    });
    last = createdAt;

    // Реакцию ставит не автор: своя отметка на своём сообщении выглядит
    // странно и не показывает, как читается чужая.
    for (const emoji of reactions ?? []) {
      const other = await prisma.chatMember.findFirst({
        where: { conversationId, userId: { not: ids[slug] } },
        select: { userId: true },
      });
      if (!other) continue;
      await prisma.chatMessageReaction.create({
        data: { messageId: message.id, userId: other.userId, emoji },
      });
    }
  }
  if (last)
    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: last },
    });
}

/**
 * Демо-община с владельцем и участниками. Без неё в dev не увидеть ни
 * значка общины в профиле, ни канала: канал заводит только администрация
 * общины, а общин в базе разработчика обычно нет вовсе.
 */
async function seedCommunity(ids) {
  if (!ids.govinda) return null;

  // Демо-община пересобирается на каждом запуске, как и демо-люди: пустой
  // `update` оставлял старую запись без новых полей — например, без
  // координат, и карта в разработке выглядела сломанной.
  const communityData = {
    kind: 'nama_hatta',
    name: 'Община Москвы (демо)',
    descriptionRu: 'Демо-община для разработки: программы, киртаны, прасад.',
    status: 'active',
    city: 'Москва',
    cityKey: 'москва',
    // Без координат община не попадает на карту, и раздел в разработке
    // выглядит сломанным, хотя он работает.
    location: {
      city: 'Москва',
      country: 'Россия',
      lat: 55.7558,
      lon: 37.6173,
      displayName: 'Москва, Россия',
    },
    createdById: ids.govinda,
  };

  const community = await prisma.community.upsert({
    where: { slug: 'demo-moscow' },
    update: communityData,
    create: { slug: 'demo-moscow', ...communityData },
  });

  const roles = [
    ['govinda', 'owner'],
    ['madhava', 'admin'],
    ['radha', 'member'],
    ['tulasi', 'member'],
    ['nitai', 'member'],
  ];

  for (const [slug, role] of roles) {
    if (!ids[slug]) continue;
    await prisma.communityMember.upsert({
      where: {
        communityId_userId: { communityId: community.id, userId: ids[slug] },
      },
      update: { role, status: 'active' },
      create: {
        communityId: community.id,
        userId: ids[slug],
        role,
        status: 'active',
        joinedAt: new Date(),
      },
    });
  }

  await prisma.community.update({
    where: { id: community.id },
    data: { membersCount: roles.filter(([slug]) => ids[slug]).length },
  });

  return community;
}

async function seedChat() {
  const ids = await demoUserIds();
  if (!ids.govinda) return 0;

  const community = await seedCommunity(ids);

  // Пересобираем демо-переписку заново: иначе повторный запуск сида множит
  // одни и те же диалоги.
  await prisma.chatConversation.deleteMany({
    where: { createdBy: { email: { endsWith: '@demo.vedamatch.local' } } },
  });

  let count = 0;

  for (const dialog of chatScript.direct) {
    const [first, second] = dialog.between;
    const pair = [ids[first], ids[second]].sort();
    const conversation = await prisma.chatConversation.create({
      data: {
        kind: 'direct',
        state: 'active',
        directKey: `${pair[0]}:${pair[1]}`,
        createdById: ids[first],
        requestedById: ids[first],
        members: {
          create: [
            // Начавший разговор всё прочитал, собеседник — нет: так в списке
            // видно и прочитанное, и счётчик непрочитанного.
            { userId: ids[first], lastReadAt: new Date() },
            { userId: ids[second] },
          ],
        },
      },
    });
    await addMessages(conversation.id, dialog.messages, ids);
    count += 1;
  }

  for (const request of chatScript.requests) {
    const pair = [ids[request.from], ids[request.to]].sort();
    const conversation = await prisma.chatConversation.create({
      data: {
        kind: 'direct',
        state: 'request',
        directKey: `${pair[0]}:${pair[1]}`,
        createdById: ids[request.from],
        requestedById: ids[request.from],
        members: {
          create: [{ userId: ids[request.from] }, { userId: ids[request.to] }],
        },
      },
    });
    await addMessages(
      conversation.id,
      [[request.from, request.message, -30]],
      ids,
    );
    count += 1;
  }

  const group = chatScript.group;
  const groupConversation = await prisma.chatConversation.create({
    data: {
      kind: 'group',
      state: 'active',
      // Группа закрытая: демо-данные должны показывать оба случая.
      visibility: 'private',
      title: group.title,
      description: group.description,
      createdById: ids[group.owner],
      members: {
        create: [
          { userId: ids[group.owner], role: 'owner', lastReadAt: new Date() },
          ...group.members.map((slug) => ({ userId: ids[slug] })),
        ],
      },
    },
  });
  await addMessages(groupConversation.id, group.messages, ids);
  count += 1;

  const channel = chatScript.channel;
  const channelConversation = await prisma.chatConversation.create({
    data: {
      kind: 'channel',
      state: 'active',
      // Канал общины — витрина: он открыт, иначе его не видно ни в каталоге,
      // ни на карте, и проверить эти экраны в разработке нечем.
      visibility: 'public',
      title: channel.title,
      description: channel.description,
      communityId: community?.id ?? null,
      createdById: ids[channel.owner],
      members: {
        create: [
          { userId: ids[channel.owner], role: 'owner', lastReadAt: new Date() },
          ...channel.subscribers.map((slug) => ({ userId: ids[slug] })),
        ],
      },
    },
  });
  await addMessages(channelConversation.id, channel.messages, ids);
  count += 1;

  return count;
}

/*
 * Демо-каталог «Музыки». Нужен, чтобы витрину и страницы записи было на чём
 * посмотреть до того, как редакция начнёт наполнять каталог по-настоящему.
 *
 * Файлов за этими записями нет: `storageKey` указывает в никуда, и слушать
 * их будет нечего, когда появится плеер. Это осознанно — демо-данные врут
 * про наличие каталога, а не про наличие звука, и подсовывать сюда чужие
 * записи ради красоты нельзя ровно по той причине, из-за которой у сервиса
 * вообще есть модерация загрузок.
 */
const musicArtists = [
  ['audarya-dhama-das', 'Аударья Дхама дас', 'kirtaneer', true],
  ['minsk-yatra-choir', 'Хор Минской ятры', 'group', false],
  ['prema-bhakti-dd', 'Према Бхакти д. д.', 'kirtaneer', true],
  ['gaurachandra-das', 'Гаурачандра дас', 'kirtaneer', false],
  ['yatra-sankirtan', 'Ятра Санкиртан', 'temple', false],
];

const musicTracks = [
  ['Джая Радха-Мадхава', 'audarya-dhama-das', 'kirtan', 198, true, 'sa'],
  ['Гаура-арати', 'minsk-yatra-choir', 'kirtan', 422, true, 'sa'],
  ['Шри Туласи-киртан', 'prema-bhakti-dd', 'bhajan', 330, false, 'sa'],
  ['Нрисимха-пранама', 'gaurachandra-das', 'mantra', 285, false, 'sa'],
  ['Према-дхвани', 'yatra-sankirtan', 'guru-puja', 132, true, 'sa'],
  ['Вечерняя арати целиком', 'minsk-yatra-choir', 'kirtan', 2460, true, 'ru'],
  ['Фон для джапы', 'gaurachandra-das', 'instrumental', 3720, false, null],
];

async function seedMusic() {
  const categories = new Map(
    (await prisma.musicCategory.findMany()).map((row) => [row.slug, row.id]),
  );
  if (categories.size === 0) {
    console.log('Категории Музыки не засеяны — сначала `pnpm seed`.');
    return 0;
  }

  const artists = new Map();
  for (const [slug, name, kind, isVerified] of musicArtists) {
    const row = await prisma.musicArtist.upsert({
      where: { slug },
      update: { name, kind, isVerified },
      create: { slug, name, kind, isVerified },
    });
    artists.set(slug, row.id);
  }

  const album = await prisma.musicAlbum.upsert({
    where: { slug: 'evening-program-minsk' },
    update: {},
    create: {
      slug: 'evening-program-minsk',
      title: 'Вечерняя программа, Минск',
      kind: 'live',
      year: 2026,
      artistId: artists.get('minsk-yatra-choir'),
    },
  });

  let created = 0;
  for (const [index, track] of musicTracks.entries()) {
    const [title, artistSlug, categorySlug, seconds, isLive, language] = track;
    const storageKey = `music/demo/${index + 1}.mp3`;
    // `storageKey` уникален — по нему и узнаём, что запись уже засеяна.
    const existing = await prisma.musicTrack.findUnique({
      where: { storageKey },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.musicTrack.create({
      data: {
        title,
        artistId: artists.get(artistSlug),
        albumId: artistSlug === 'minsk-yatra-choir' ? album.id : null,
        storageKey,
        mime: 'audio/mpeg',
        sizeBytes: seconds * 24000,
        durationSeconds: seconds,
        bitrateKbps: 192,
        language,
        isLiveRecording: isLive,
        status: 'published',
        // Разводим по времени, чтобы «Новое в каталоге» имело порядок.
        publishedAt: new Date(Date.now() - (index + 1) * 3600_000),
        categories: { create: [{ categoryId: categories.get(categorySlug) }] },
      },
    });
    created += 1;
  }

  return created;
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
  const conversations = await seedChat();
  console.log(
    `\nСоздано демо-аккаунтов: ${people.length + 1}. Пароль у всех: ${DEMO_PASSWORD}`,
  );
  console.log(`Демо-бесед в «Общении»: ${conversations}`);
  const musicCreated = await seedMusic();
  console.log(`Демо-записей в «Музыке»: ${musicCreated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
