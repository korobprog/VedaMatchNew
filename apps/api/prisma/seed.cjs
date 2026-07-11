const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

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
    status: 'coming_soon',
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
    url: 'https://motivation.vedamatch.ru',
    status: 'coming_soon',
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
];

async function main() {
  for (const service of services) {
    await prisma.service.upsert({
      where: { slug: service.slug },
      update: service,
      create: service,
    });
  }
  console.log(`Seeded ${services.length} services`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
