const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TRACKS = [
  ['Шри Гуру-вандана', 240],
  ['Харе Кришна маха-мантра (утренний киртан)', 612],
  ['Джая Радха-Мадхава', 318],
  ['Гаура-арати', 425],
];

async function main() {
  if ((await prisma.musicTrack.count()) > 0) {
    console.log('Записи уже посеяны');
    return;
  }
  const artist = await prisma.musicArtist.upsert({
    where: { slug: 'demo-kirtan' },
    update: {},
    create: { slug: 'demo-kirtan', name: 'Авантика деви даси', kind: 'kirtaneer' },
  });
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  let n = 0;
  for (const [title, durationSeconds] of TRACKS) {
    await prisma.musicTrack.create({
      data: {
        title, artistId: artist.id,
        storageKey: `demo/track-${n}.mp3`,
        mime: 'audio/mpeg', sizeBytes: 5_000_000,
        durationSeconds, bitrateKbps: 192,
        status: 'published', publishedAt: new Date(Date.now() - n * 86400_000),
        uploadedById: admin?.id ?? null, language: 'sa',
      },
    });
    n += 1;
  }
  console.log('Записей:', await prisma.musicTrack.count());
}

main().finally(() => prisma.$disconnect());
