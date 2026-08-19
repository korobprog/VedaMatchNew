/*
 * Демо-книга Vedabase для локальной отладки: две главы Бхагавад-гиты с
 * несколькими стихами. Нужна, чтобы проверять сценарии, которым требуется
 * содержимое книг — выбор цитаты в мастере «Свой рилс», поиск и сверку
 * источника, — не выгружая настоящий корпус.
 *
 * Запуск: pnpm --filter @vedamatch/api seed:vedabase
 * Удалить: delete from "VedabaseBook" where slug = 'demo-bhagavad-gita';
 */
const { PrismaClient } = require('@prisma/client');
const { createHash } = require('node:crypto');

const prisma = new PrismaClient();

const BOOK_SLUG = 'demo-bhagavad-gita';
const CONTENT_VERSION = 'demo-1';

const CHAPTERS = [
  {
    slug: 'chapter-2',
    title: 'Глава 2. Обзор «Бхагавад-гиты»',
    order: 1,
    verses: [
      {
        locator: { chapter: 2, verse: 47 },
        title: 'Стих 2.47',
        text: 'Ты имеешь право лишь на действие, но не на его плоды. Не считай себя причиной плодов своей деятельности и никогда не привязывайся к бездействию.',
      },
      {
        locator: { chapter: 2, verse: 48 },
        title: 'Стих 2.48',
        text: 'Будь уравновешен, о Арджуна. Выполняй свой долг, не беспокоясь об успехе или неудаче. Такое самообладание называют йогой.',
      },
      {
        locator: { chapter: 2, verse: 62 },
        title: 'Стих 2.62',
        text: 'Созерцая объекты чувств, человек развивает привязанность к ним; из привязанности рождается вожделение, а из вожделения — гнев.',
      },
    ],
  },
  {
    slug: 'chapter-6',
    title: 'Глава 6. Дхьяна-йога',
    order: 2,
    verses: [
      {
        locator: { chapter: 6, verse: 5 },
        title: 'Стих 6.5',
        text: 'Человек должен освободить себя с помощью своего ума, а не деградировать. Ум — друг обусловленной души и её же враг.',
      },
      {
        locator: { chapter: 6, verse: 6 },
        title: 'Стих 6.6',
        text: 'Для того, кто победил ум, он становится лучшим другом, но для того, кто не сумел этого сделать, ум остаётся злейшим врагом.',
      },
    ],
  },
];

const sha = (value) => createHash('sha256').update(value).digest('hex');

/** Единица чтения в том виде, в каком её ждёт читалка. */
function readingUnit(verse, index, chapterSlug) {
  return {
    id: `${chapterSlug}-${index + 1}`,
    title: verse.title,
    sourceUrl: `https://vedabase.ru/${BOOK_SLUG}/${chapterSlug}#${index + 1}`,
    translationHtml: `<p>${verse.text}</p>`,
  };
}

async function main() {
  const book = await prisma.vedabaseBook.upsert({
    where: { slug: BOOK_SLUG },
    create: {
      slug: BOOK_SLUG,
      title: 'Бхагавад-гита как она есть (демо)',
      author: 'А. Ч. Бхактиведанта Свами Прабхупада',
      language: 'ru',
      sourceUrl: 'https://vedabase.ru/ru/library/bg/',
      attribution: 'Демонстрационный фрагмент для локальной разработки',
    },
    update: {},
    select: { id: true },
  });

  const payloadSize = JSON.stringify(CHAPTERS).length;
  const version = await prisma.vedabaseBookVersion.upsert({
    where: { bookId_contentVersion: { bookId: book.id, contentVersion: CONTENT_VERSION } },
    create: {
      bookId: book.id,
      contentVersion: CONTENT_VERSION,
      formatVersion: 1,
      status: 'active',
      permissionRef: 'local-dev',
      attribution: 'Демонстрационный фрагмент для локальной разработки',
      importedAt: new Date(),
      sizeBytes: BigInt(payloadSize),
      packageChecksum: sha(CONTENT_VERSION),
      chapterCount: CHAPTERS.length,
      searchableUnitCount: CHAPTERS.reduce((sum, chapter) => sum + chapter.verses.length, 0),
      searchIndexBytes: payloadSize,
      searchIndexSha256: sha(`${CONTENT_VERSION}:index`),
    },
    update: { status: 'active' },
    select: { id: true },
  });

  // Перезаливаем содержимое целиком: демо-данные проще пересоздать, чем
  // сверять построчно.
  await prisma.vedabaseChapter.deleteMany({ where: { versionId: version.id } });
  await prisma.vedabaseSearchUnit.deleteMany({ where: { versionId: version.id } });

  for (const chapter of CHAPTERS) {
    const payload = {
      bookSlug: BOOK_SLUG,
      slug: chapter.slug,
      title: chapter.title,
      order: chapter.order,
      units: chapter.verses.map((verse, index) => readingUnit(verse, index, chapter.slug)),
    };
    const serialized = JSON.stringify(payload);
    await prisma.vedabaseChapter.create({
      data: {
        versionId: version.id,
        slug: chapter.slug,
        title: chapter.title,
        order: chapter.order,
        payload,
        bytes: serialized.length,
        sha256: sha(serialized),
      },
    });
    await prisma.vedabaseSearchUnit.createMany({
      data: chapter.verses.map((verse) => ({
        versionId: version.id,
        chapterSlug: chapter.slug,
        locator: verse.locator,
        title: verse.title,
        text: verse.text,
      })),
    });
  }

  await prisma.vedabaseBook.update({
    where: { id: book.id },
    data: { activeVersionId: version.id },
  });

  console.log(
    `Демо-книга «${BOOK_SLUG}» готова: ${CHAPTERS.length} главы, ` +
      `${CHAPTERS.reduce((sum, chapter) => sum + chapter.verses.length, 0)} стихов.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
