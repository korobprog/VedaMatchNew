import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { librarySections } = require('./library-sections-data.js') as {
  librarySections: Array<{
    slug: string;
    titleRu: string;
    titleEn: string;
    iconKey: string;
    position: number;
  }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contactsTags } = require('./contacts-tags-data.js') as {
  contactsTags: Array<{
    slug: string;
    kind: 'service' | 'profession' | 'skill' | 'interest';
    nameRu: string;
    isSystem: boolean;
    sortOrder: number;
  }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { marketSections } = require('./market-sections-data.js') as {
  marketSections: Array<{
    slug: string;
    titleRu: string;
    titleEn: string;
    iconKey: string;
    position: number;
  }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { marketCategories } = require('./market-categories-data.js') as {
  marketCategories: Array<{
    sectionSlug: string;
    slug: string;
    titleRu: string;
    titleEn: string;
    position: number;
    prohibited?: boolean;
  }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { noticeRubrics } = require('./notice-rubrics-data.js') as {
  noticeRubrics: Array<{
    slug: string;
    kinds: Array<'offer' | 'request' | 'event' | 'info'>;
    nameRu: string;
    nameEn: string;
  }>;
};

const services = [
  {
    slug: 'union',
    name: 'Знакомства',
    description: 'Осознанные знакомства и сотрудничество: семья, дружба, служение, проекты',
    url: '/union',
    status: 'active' as const,
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
    status: 'active' as const,
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
    status: 'active' as const,
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
    status: 'active' as const,
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
    status: 'active' as const,
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
    status: 'active' as const,
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
    status: 'active' as const,
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
    status: 'active' as const,
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
      await transaction.librarySection.upsert({
        where: { slug: section.slug },
        update: section,
        create: section,
      });
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
    // Каталог Рынка фиксирован: разделы и категории заводит только сид и админ,
    // поэтому upsert по slug безопасен — он освежает названия и порядок и
    // никогда не трогает объявления, привязанные к категории.
    const marketSectionIdBySlug = new Map<string, string>();
    for (const section of marketSections) {
      const saved = await transaction.marketSection.upsert({
        where: { slug: section.slug },
        update: section,
        create: section,
      });
      marketSectionIdBySlug.set(saved.slug, saved.id);
    }
    for (const category of marketCategories) {
      const sectionId = marketSectionIdBySlug.get(category.sectionSlug);
      if (!sectionId) {
        throw new Error(
          `market category "${category.slug}" references unknown section "${category.sectionSlug}"`,
        );
      }
      const { sectionSlug: _sectionSlug, prohibited: _prohibited, ...fields } = category;
      await transaction.marketCategory.upsert({
        where: { sectionId_slug: { sectionId, slug: category.slug } },
        update: fields,
        create: { ...fields, sectionId },
      });
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
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
