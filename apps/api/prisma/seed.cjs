const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const { librarySections } = require('./library-sections-data.js');
const { contactsTags } = require('./contacts-tags-data.js');

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
    name: 'Библиотека ссылок',
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
    name: 'Джйотиш',
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
  });
  console.log(
    `Seeded ${services.length} services, ${librarySections.length} library sections and ${contactsTags.length} contacts tags`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
