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
    name: 'Библиотека ссылок',
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
  });
  console.log(
    `Seeded ${services.length} services and ${librarySections.length} library sections`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
