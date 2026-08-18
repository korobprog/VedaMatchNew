#!/usr/bin/env node
/**
 * Безвозвратное удаление аккаунта из командной строки.
 *
 * Тот же результат, что и кнопка «Удалить безвозвратно» в админке, но без
 * поднятого API: нужен только доступ к базе (DATABASE_URL) и, если чистить
 * файлы, к хранилищу (S3_*). Строки сносит каскад Postgres от User, объекты
 * в S3 приходится собирать заранее — после каскада искать их негде.
 *
 * Порядок:
 *   pnpm --filter @vedamatch/api exec node scripts/purge-user.mjs <email>
 *       — сухой прогон: показывает, что будет снесено, и ничего не трогает.
 *   ... scripts/purge-user.mjs <email> --confirm <email>
 *       — удаление. Email вводится дважды намеренно: отмены не будет.
 *
 * Флаг --keep-files оставляет объекты в бакете (например, если S3_* недоступны).
 */
import { PrismaClient } from '@prisma/client';
import { DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';

/** Предел DeleteObjects в S3-совместимых хранилищах. */
const S3_DELETE_BATCH = 1000;

const args = process.argv.slice(2);
const email = args.find((arg) => !arg.startsWith('--'));
const confirmIndex = args.indexOf('--confirm');
const confirmEmail = confirmIndex >= 0 ? args[confirmIndex + 1] : undefined;
const keepFiles = args.includes('--keep-files');

if (!email) {
  console.error(
    'Укажите email: node scripts/purge-user.mjs <email> [--confirm <email>] [--keep-files]',
  );
  process.exit(1);
}

const prisma = new PrismaClient();

/** Ключи загруженных файлов относительные; абсолютный URL — чужой объект. */
function isDirectUrl(key) {
  return (
    key.startsWith('/') ||
    key.startsWith('http://') ||
    key.startsWith('https://')
  );
}

function makeS3Client() {
  const region = process.env.S3_REGION;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const endpoint = process.env.S3_ENDPOINT;
  if (!region || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      spiritualName: true,
      role: true,
      accountStatus: true,
      createdAt: true,
      avatarKey: true,
    },
  });
  if (!user) {
    console.error(`Пользователь ${email} не найден.`);
    process.exit(1);
  }

  const [photos, shop, notices, counts] = await Promise.all([
    prisma.userPhoto.findMany({
      where: { userId: user.id },
      select: { storageKey: true },
    }),
    prisma.marketShop.findUnique({
      where: { ownerId: user.id },
      select: {
        name: true,
        logoKey: true,
        coverKey: true,
        listings: { select: { images: { select: { storageKey: true } } } },
      },
    }),
    prisma.notice.findMany({
      where: { authorId: user.id },
      select: { images: { select: { storageKey: true } } },
    }),
    countRelated(user.id),
  ]);

  const storageKeys = [
    ...new Set(
      [
        user.avatarKey,
        shop?.logoKey,
        shop?.coverKey,
        ...photos.map((photo) => photo.storageKey),
        ...(shop?.listings ?? []).flatMap((listing) =>
          listing.images.map((image) => image.storageKey),
        ),
        ...notices.flatMap((notice) =>
          notice.images.map((image) => image.storageKey),
        ),
      ].filter((key) => key && !isDirectUrl(key)),
    ),
  ];

  console.log('');
  console.log(`Аккаунт:      ${user.email}`);
  console.log(`Имя:          ${user.spiritualName || user.name}`);
  console.log(`Роль/статус:  ${user.role} / ${user.accountStatus}`);
  console.log(`Создан:       ${user.createdAt.toISOString()}`);
  console.log('');
  console.log('Будет снесено:');
  console.log(`  фотографий галереи:      ${photos.length}`);
  console.log(
    `  магазин Маркета:         ${shop ? `«${shop.name}», объявлений: ${shop.listings.length}` : 'нет'}`,
  );
  console.log(`  объявлений на доске:     ${notices.length}`);
  for (const [label, value] of Object.entries(counts)) {
    console.log(`  ${label.padEnd(24)} ${value}`);
  }
  console.log(`  файлов в хранилище:      ${storageKeys.length}`);
  console.log('');
  console.log(
    '* — строки переживут удаление: автор в них обнулится (SetNull), сам текст',
  );
  console.log('    останется, чтобы не рвать чужие ветки обсуждения и историю.');
  console.log('');

  if (confirmEmail !== user.email) {
    console.log(
      'Сухой прогон: ничего не удалено. Для удаления повторите email:',
    );
    console.log(
      `  node scripts/purge-user.mjs ${user.email} --confirm ${user.email}`,
    );
    return;
  }

  await prisma.user.delete({ where: { id: user.id } });
  console.log(`Строка User удалена, сервисные данные снесены каскадом.`);

  if (keepFiles || storageKeys.length === 0) {
    if (storageKeys.length > 0) {
      console.log(`Файлы оставлены в бакете по флагу --keep-files.`);
    }
    return;
  }

  const s3Client = makeS3Client();
  const bucket = process.env.S3_BUCKET_NAME;
  if (!s3Client || !bucket) {
    console.warn(
      `S3 не настроен: ${storageKeys.length} файлов остались в бакете.`,
    );
    return;
  }

  let failures = 0;
  for (let offset = 0; offset < storageKeys.length; offset += S3_DELETE_BATCH) {
    const batch = storageKeys.slice(offset, offset + S3_DELETE_BATCH);
    try {
      const result = await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      failures += result.Errors?.length ?? 0;
    } catch (error) {
      failures += batch.length;
      console.warn(`Не удалось удалить пачку файлов: ${String(error)}`);
    }
  }
  console.log(
    `Файлов удалено: ${storageKeys.length - failures}${failures ? `, не удалось: ${failures}` : ''}.`,
  );
}

/** Счётчики по сервисам — чтобы до удаления было видно масштаб. */
async function countRelated(userId) {
  const [
    unionProfile,
    contactsProfile,
    unionMessages,
    marketOrders,
    libraryEntries,
    libraryComments,
    communityMemberships,
    supportTickets,
  ] = await Promise.all([
    prisma.unionProfile.count({ where: { userId } }),
    prisma.contactsProfile.count({ where: { userId } }),
    prisma.unionChatMessage.count({ where: { fromUserId: userId } }),
    prisma.marketOrder.count({ where: { buyerId: userId } }),
    prisma.libraryEntry.count({ where: { addedById: userId } }),
    prisma.libraryComment.count({ where: { userId } }),
    prisma.communityMember.count({ where: { userId } }),
    prisma.supportTicket.count({ where: { userId } }),
  ]);
  return {
    'профиль Union:': unionProfile,
    'профиль Контактов:': contactsProfile,
    'сообщений Union:': unionMessages,
    'заказов Маркета:': marketOrders,
    'записей Библиотеки:*': libraryEntries,
    'комментариев Библиотеки:*': libraryComments,
    'членств в общинах:': communityMemberships,
    'обращений в поддержку:*': supportTickets,
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
