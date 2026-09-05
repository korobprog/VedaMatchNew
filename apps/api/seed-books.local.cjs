const { PrismaClient } = require('@prisma/client');
const { createHash } = require('node:crypto');
const prisma = new PrismaClient();

const sha = (s) => createHash('sha256').update(s).digest('hex');

/** Главы Бхагаватам: две песни, слаги «песнь-глава» — как их пишет импорт. */
const SB_CHAPTERS = [
  ['1-1', 'Вопросы мудрецов'],
  ['1-2', 'Божественность и божественное служение'],
  ['1-3', 'Кришна — источник всех воплощений'],
  ['2-1', 'Первая ступень осознания Бога'],
  ['2-2', 'Господь в сердце'],
];

/** Чайтанья-чаритамрита: три лилы. */
const CC_CHAPTERS = [
  ['1-1', 'Духовные учители'],
  ['1-2', 'Шри Чайтанья и Нитьянанда'],
  ['2-1', 'Поздние игры Господа'],
  ['3-1', 'Встреча с Рупой Госвами'],
];

/** Гита: без песней — слаги просто номера. */
const BG_CHAPTERS = [
  ['1', 'Обзор армий на поле битвы Курукшетра'],
  ['2', 'Краткое изложение «Бхагавад-гиты»'],
];

async function book(slug, title, author, chapters) {
  const created = await prisma.vedabaseBook.upsert({
    where: { slug },
    update: { title, author },
    create: {
      slug, title, author, kind: 'scripture', language: 'ru',
      sourceUrl: `https://vedabase.ru/${slug}`,
      attribution: 'vedabase.ru (демо)',
    },
  });
  const version = await prisma.vedabaseBookVersion.create({
    data: {
      bookId: created.id, contentVersion: `demo-${Date.now()}`, formatVersion: 1,
      status: 'active', permissionRef: 'demo', attribution: 'vedabase.ru (демо)',
      importedAt: new Date(), sizeBytes: BigInt(1024),
      packageChecksum: sha(slug), chapterCount: chapters.length,
      searchableUnitCount: chapters.length, searchIndexBytes: 0,
      searchIndexSha256: sha('index'),
    },
  });
  let order = 0;
  for (const [chapterSlug, chapterTitle] of chapters) {
    const payload = {
      bookSlug: slug, slug: chapterSlug, title: chapterTitle, order,
      units: [{
        id: sha(`${slug}:${chapterSlug}`).slice(0, 24),
        title: `${chapterTitle}, текст 1`,
        sourceUrl: `https://vedabase.ru/${slug}/${chapterSlug}`,
        translationHtml: '<p>Демонстрационный перевод для проверки оглавления.</p>',
        purportHtml: '<p>Комментарий к тексту.</p>',
      }],
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    await prisma.vedabaseChapter.create({
      data: {
        versionId: version.id, slug: chapterSlug, title: chapterTitle,
        order, payload, bytes: body.byteLength, sha256: sha(body.toString()),
      },
    });
    order += 1;
  }
  await prisma.vedabaseBook.update({
    where: { id: created.id }, data: { activeVersionId: version.id },
  });
}

async function main() {
  if ((await prisma.vedabaseBook.count()) > 0) {
    console.log('Книги уже посеяны');
    return;
  }
  await book('srimad-bhagavatam', 'Шримад-Бхагаватам', 'А. Ч. Бхактиведанта Свами Прабхупада', SB_CHAPTERS);
  await book('chaitanya-charitamrita', 'Чайтанья-чаритамрита', 'Кришнадас Кавирадж Госвами', CC_CHAPTERS);
  await book('bhagavad-gita', 'Бхагавад-гита как она есть', 'А. Ч. Бхактиведанта Свами Прабхупада', BG_CHAPTERS);
  console.log('Книг:', await prisma.vedabaseBook.count(), 'глав:', await prisma.vedabaseChapter.count());
}

main().finally(() => prisma.$disconnect());
