/**
 * Демо-данные для визуальной проверки на стенде. Не часть репозитория:
 * лежит в рабочей папке сессии, в git не попадает.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/** Картинка-заглушка: сплошной цвет в data-URI, хранилище не нужно. */
const IMG = (hue) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960"><rect width="720" height="960" fill="hsl(${hue} 60% 35%)"/></svg>`,
  )}`;

const QUOTES = [
  ['Душа не рождается и не умирает', 'Она не возникала, не возникает и не возникнет.', 'Бхагавад-гита', '2.20', 'vedy'],
  ['Служение выше отречения', 'Отречение без служения оставляет человека наедине с собой.', 'Шримад-Бхагаватам', '1.2.8', 'vaishnavizm'],
  ['Ум — друг и враг', 'Для того, кто победил ум, он лучший друг.', 'Бхагавад-гита', '6.6', 'filosofiya'],
  ['Терпение как дерево', 'Будь терпеливее дерева, смиреннее травинки.', 'Шикшаштака', '3', 'vaishnavizm'],
  ['Слово, сказанное вовремя', 'Пословица: доброе слово и кошке приятно.', null, null, 'poslovicy'],
  ['Начни с малого', 'Одна страница в день — это книга за год.', null, null, 'filosofiya'],
];

async function categories() {
  const roots = [
    ['vedy', 'Веды', 0],
    ['vaishnavizm', 'Вайшнавизм', 1],
    ['filosofiya', 'Философия', 2],
    ['poslovicy', 'Пословицы', 3],
  ];
  const made = {};
  for (const [slug, title, sortOrder] of roots) {
    made[slug] = await prisma.motivationCategory.upsert({
      where: { slug },
      update: {},
      create: { slug, title, sortOrder },
    });
  }
  // Подкатегория — чтобы проверить дерево в «Подборках».
  await prisma.motivationCategory.upsert({
    where: { slug: 'gita' },
    update: {},
    create: { slug: 'gita', title: 'Бхагавад-гита', sortOrder: 0, parentId: made.vedy.id },
  });
  return made;
}

async function motivation() {
  await categories();
  let n = 0;
  for (const [title, text, work, locator, category] of QUOTES) {
    const slug = `demo-${n}`;
    const post = await prisma.motivationPost.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        contentDate: new Date(),
        profileType: 'user',
        audienceTrack: 'universal',
        category: n === 0 ? 'gita' : category,
        status: 'published',
        reviewStatus: 'published',
        imageUrl: IMG(200 + n * 25),
        storyImageUrl: IMG(200 + n * 25),
        attributionKind: work ? 'exact_quote' : 'ai_reflection',
        attributionSpeaker: work ? 'Прабхупада' : null,
        attributionWork: work,
        attributionLocator: locator,
        sourceVerified: Boolean(work),
        publishedAt: new Date(Date.now() - n * 3600_000),
        textApprovedAt: new Date(),
        imageApprovedAt: new Date(),
      },
    });
    await prisma.motivationPostTranslation.upsert({
      where: { postId_language: { postId: post.id, language: 'ru' } },
      update: {},
      create: { postId: post.id, language: 'ru', title, text: `${text}\n\nПояснение к ${title.toLowerCase()}.`, storyText: title },
    });
    n += 1;
  }
  // Одна заготовка — чтобы вкладки админки различались.
  const draft = await prisma.motivationPost.upsert({
    where: { slug: 'demo-draft' },
    update: {},
    create: {
      slug: 'demo-draft', contentDate: new Date(), profileType: 'user',
      audienceTrack: 'universal', category: 'vedy', status: 'draft',
      reviewStatus: 'text_review',
    },
  });
  await prisma.motivationPostTranslation.upsert({
    where: { postId_language: { postId: draft.id, language: 'ru' } },
    update: {},
    create: { postId: draft.id, language: 'ru', title: 'Ждёт проверки', text: 'Черновик редакции', storyText: 'Ждёт проверки' },
  });
  console.log('Вдохновение:', await prisma.motivationPost.count());
}

async function main() {
  await motivation();
}


async function library() {
  const cats = await prisma.libraryCategory.findMany({ where: { parentId: null }, take: 3 });
  const community = await prisma.community.findFirst({ where: { status: 'active' } });
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  const items = [
    ['https://vedabase.io/ru/library/bg/', 'Бхагавад-гита как она есть', 'website', community?.id ?? null],
    ['https://www.youtube.com/watch?v=demo1', 'Лекция о преданном служении', 'video', community?.id ?? null],
    ['https://t.me/demo_channel', 'Канал ежедневных цитат', 'telegram_channel', null],
    [null, 'Шримад-Бхагаватам 1.2.8, комментарий', 'book', null],
  ];
  for (const [url, title, type, communityId] of items) {
    const entry = await prisma.libraryEntry.upsert({
      where: { urlNormalized: url ?? `source:${title}` },
      update: {},
      create: {
        url, urlNormalized: url ?? `source:${title}`,
        source: url ? null : 'Шримад-Бхагаватам 1.2.8',
        type, contentLanguage: 'ru', titleRu: title,
        descriptionRu: 'Демо-материал для проверки раздела.',
        addedById: admin?.id ?? null, communityId,
        enrichmentStatus: url ? 'ready' : 'not_applicable',
      },
    });
    const cat = cats[Math.floor(Math.random() * cats.length)];
    if (cat)
      await prisma.libraryEntryCategory.upsert({
        where: { entryId_categoryId: { entryId: entry.id, categoryId: cat.id } },
        update: {},
        create: { entryId: entry.id, categoryId: cat.id, addedById: admin?.id ?? null },
      });
  }
  console.log('Образование:', await prisma.libraryEntry.count());
}

library().finally(() => prisma.$disconnect());
