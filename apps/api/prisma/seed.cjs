const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Разделы библиотеки и каталог Рынка администратор правит из админки
// (названия, описания, иконки, порядок). Сид запускается при каждом старте
// контейнера, поэтому по умолчанию он такие строки только создаёт, а не
// перезаписывает — иначе правки админа молча терялись бы на первом рестарте.
// Чтобы принудительно «освежить» тексты из файлов данных, запустите сид с
// SEED_REFRESH_ADMIN_EDITABLE=1.
const refreshAdminEditable = process.env.SEED_REFRESH_ADMIN_EDITABLE === '1';

/** upsert для строк, которые может править администратор. */
async function upsertAdminEditable(model, where, fields) {
  if (refreshAdminEditable) {
    return model.upsert({ where, update: fields, create: fields });
  }
  const existing = await model.findUnique({ where });
  if (existing) return existing;
  return model.create({ data: fields });
}

const { librarySections } = require('./library-sections-data.js');
const { contactsTags } = require('./contacts-tags-data.js');
const { marketSections } = require('./market-sections-data.js');
const { marketCategories } = require('./market-categories-data.js');
const { noticeRubrics } = require('./notice-rubrics-data.js');

const services = [
  {
    slug: 'union',
    name: 'Знакомства',
    description:
      'Осознанные знакомства и сотрудничество: семья, дружба, служение, проекты',
    url: '/union',
    status: 'active',
    category: 'community',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'vedabase',
    name: 'Книги',
    description: 'База знаний по Бхагавад-гите и ведическим текстам',
    url: '/vedabase',
    status: 'active',
    category: 'knowledge',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'motivation',
    name: 'Мотивация',
    description: 'Ежедневная мотивация и практики саморазвития',
    url: '/motivation',
    status: 'active',
    category: 'lifestyle',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'library',
    name: 'Образование',
    description:
      'Общая база полезных материалов: статьи, видео, книги, курсы и каналы',
    url: '/library',
    status: 'active',
    category: 'knowledge',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'astro',
    name: 'Астрология',
    description:
      'Ведическая карта рождения с разбором и совместимость по звёздам',
    url: '/astro',
    // active: карта, разборы и совместимость (гуна-милан) работают и покрыты
    // тестами. Ежедневный персональный день по транзитам (Э6) ещё не готов —
    // когда появится, стоит дополнить описание, а не менять статус повторно.
    status: 'active',
    category: 'knowledge',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'contacts',
    name: 'Контакты',
    description:
      'Справочник общины: преподаватели, служения, профессии и навыки рядом',
    url: '/contacts',
    // active: карточка, поиск с фильтрами и запросы контакта работают.
    // Модерация карточек и «кто смотрел» — отдельный этап, статуса не меняют.
    status: 'active',
    category: 'community',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'market',
    name: 'Рынок',
    description:
      'Объявления комерческие и услуги в благости: товары, книги, мастерские и помощь',
    url: '/market',
    // active: витрина, каталог, фильтры, избранное и кабинет продавца готовы
    // и покрыты тестами. Корзина, заявки и чат — фаза 2, статуса не меняют.
    status: 'active',
    category: 'community',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'notices',
    name: 'Объявления',
    description:
      'Некоммерческая доска общины: отдам даром, нужны руки, попутчики, программы ятр',
    url: '/notices',
    // active: доска, отклики, благодарности и модерация жалоб готовы и
    // покрыты тестами. Карта и календарь — следующий этап, статуса не меняют.
    status: 'active',
    category: 'community',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
];

async function main() {
  await prisma.$transaction(async (transaction) => {
    await transaction.service.deleteMany({
      where: {
        OR: [
          { slug: 'gitabase' },
          { name: 'VedaMatch Union Gitabase' },
          { slug: 'devotee-space' },
        ],
      },
    });
    for (const service of services) {
      await transaction.service.upsert({
        where: { slug: service.slug },
        update: service,
        create: service,
      });
    }
    for (const section of librarySections) {
      await upsertAdminEditable(
        transaction.librarySection,
        { slug: section.slug },
        section,
      );
    }
    // Пользовательские теги сюда не попадают: upsert идёт по slug, а список
    // системных фиксирован, поэтому повторный прогон только освежает названия
    // и порядок и никогда не удаляет то, что завели через модерацию.
    for (const tag of contactsTags) {
      await transaction.contactsTag.upsert({
        where: { slug: tag.slug },
        update: tag,
        create: tag,
      });
    }
    // Каталог Рынка фиксирован: разделы и категории заводит только сид и админ.
    // Сид не трогает объявления, привязанные к категории, и (без флага
    // SEED_REFRESH_ADMIN_EDITABLE) не перезаписывает то, что правил админ.
    const marketSectionIdBySlug = new Map();
    for (const section of marketSections) {
      const saved = await upsertAdminEditable(
        transaction.marketSection,
        { slug: section.slug },
        section,
      );
      marketSectionIdBySlug.set(saved.slug, saved.id);
    }
    for (const category of marketCategories) {
      const sectionId = marketSectionIdBySlug.get(category.sectionSlug);
      if (!sectionId) {
        throw new Error(
          `market category "${category.slug}" references unknown section "${category.sectionSlug}"`,
        );
      }
      const { sectionSlug, prohibited, ...fields } = category;
      void sectionSlug;
      void prohibited;
      await upsertAdminEditable(
        transaction.marketCategory,
        { sectionId_slug: { sectionId, slug: category.slug } },
        { ...fields, sectionId },
      );
    }
    // Рубрики доски объявлений. `position` берётся из порядка в файле, чтобы
    // не держать номер отдельным полем и не рассинхронизировать его правкой.
    for (const [index, rubric] of noticeRubrics.entries()) {
      const fields = { ...rubric, position: index, isSystem: true };
      await transaction.noticeRubric.upsert({
        where: { slug: rubric.slug },
        update: fields,
        create: fields,
      });
    }
  });
  console.log(
    `Seeded ${services.length} services, ${librarySections.length} library sections, ${contactsTags.length} contacts tags, ${marketSections.length} market sections, ${marketCategories.length} market categories and ${noticeRubrics.length} notice rubrics`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
