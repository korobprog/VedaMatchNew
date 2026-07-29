const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const { librarySections } = require('./library-sections-data.js');

const services = [
  {
    slug: 'union',
    name: 'VedaMatch Union',
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
    name: 'Vedabase',
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
    name: 'VedaMatch Motivation',
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
    slug: 'devotee-space',
    name: 'VedaMatch Devotee Space',
    description: 'Закрытые материалы и сервисы для подтвержденных преданных',
    url: 'https://devotee.vedamatch.ru',
    status: 'coming_soon',
    category: 'community',
    public: false,
    seekerVisible: false,
    practitionerVisible: false,
    yogiVisible: false,
    devoteeSelfIdentifiedVisible: false,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'library',
    name: 'Библиотека ссылок',
    description:
      'Общая база полезных материалов: статьи, видео, книги, курсы и каналы',
    url: '/library',
    status: 'coming_soon',
    category: 'knowledge',
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
  });
  console.log(
    `Seeded ${services.length} services and ${librarySections.length} library sections`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
