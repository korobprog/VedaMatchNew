import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const services = [
  {
    slug: 'union',
    name: 'VedaMatch Union',
    description: 'Сообщество и знакомства по духовным ценностям',
    url: 'https://union.vedamatch.ru',
    status: 'coming_soon' as const,
    category: 'community',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
  {
    slug: 'gitabase',
    name: 'VedaMatch Union Gitabase',
    description: 'База знаний по Бхагавад-гите и ведическим текстам',
    url: 'https://gitabase.vedamatch.ru',
    status: 'coming_soon' as const,
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
    status: 'coming_soon' as const,
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
    status: 'coming_soon' as const,
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
  for (const s of services) {
    await prisma.service.upsert({
      where: { slug: s.slug },
      update: s,
      create: s,
    });
  }
  console.log(`Seeded ${services.length} services`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
