/*
 * Ужимает фотографии галереи, залитые до появления предела на размер.
 *
 * Локально: pnpm --filter @vedamatch/api gallery:shrink [--dry-run] [--limit=N]
 * В контейнере: node dist/modules/users/backfill-gallery-sizes.js [--dry-run]
 *
 * Файл лежит в src, а не в scripts/, именно чтобы попадать в dist: в
 * рантайм-образ копируется только dist и прод-зависимости, ts-node там нет.
 * Тот же приём, что у backfill-previews.
 *
 * Обратимость — главное свойство этого прохода. Оригинал НЕ перезаписывается и
 * НЕ удаляется: ужатая копия ложится рядом, под ключом с суффиксом, а в базе
 * меняется указатель. Откат — вернуть прежний storageKey; ключ выводится из
 * нового снятием суффикса. Поэтому же проход идемпотентен: снимок, у которого
 * обе стороны уже в пределах, не трогается вовсе.
 *
 * По одной фотографии за раз и без параллелизма: это скачивание, распаковка и
 * сжатие изображений — распараллеливать их значит соревноваться с самим собой
 * за память и канал.
 */
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import {
  isDirectUrl,
  isShrunkStorageKey,
  MAX_IMAGE_DIMENSION,
  needsShrink,
  shrunkStorageKey,
  toStorageImage,
} from './gallery-image';

const BATCH_SIZE = 200;

function s3From(config: ConfigService): { client: S3Client; bucket: string } {
  const region = config.get<string>('S3_REGION');
  const accessKeyId = config.get<string>('S3_ACCESS_KEY');
  const secretAccessKey = config.get<string>('S3_SECRET_KEY');
  const endpoint = config.get<string>('S3_ENDPOINT');
  const bucket = config.get<string>('S3_BUCKET_NAME');

  if (!region || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'S3 не настроен: нужны S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_NAME',
    );
  }
  return {
    bucket,
    client: new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

export async function backfillGallerySizes(argv: string[] = []) {
  const dryRun = argv.includes('--dry-run');
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

  const prisma = new PrismaClient();
  /*
    Хранилище нужно только настоящему проходу: сухой считает по базе и в S3 не
    ходит. Значит и ключи для него незачем требовать — иначе прикинуть масштаб
    на проде можно было бы только с полным доступом на запись. Зато для
    настоящего прохода они запрашиваются сразу: упасть на середине, оставив
    половину галереи переведённой, хуже, чем не начинать.
  */
  const storage = dryRun ? null : s3From(new ConfigService());

  let cursor: string | undefined;
  let scanned = 0;
  let shrunk = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  try {
    for (;;) {
      const photos = await prisma.userPhoto.findMany({
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          storageKey: true,
          width: true,
          height: true,
          sizeBytes: true,
        },
      });
      if (photos.length === 0) break;
      cursor = photos.at(-1)?.id;

      for (const photo of photos) {
        if (scanned >= limit) break;
        scanned += 1;

        // Демо-аккаунты держат в ключе готовый адрес — в S3 такого объекта нет.
        if (isDirectUrl(photo.storageKey)) continue;
        if (isShrunkStorageKey(photo.storageKey)) continue;
        if (!needsShrink(photo.width, photo.height)) continue;

        const targetKey = shrunkStorageKey(photo.storageKey);
        console.log(
          `${dryRun ? '[dry-run] ' : ''}${photo.storageKey} ` +
            `(${photo.width}×${photo.height}, ${Math.round(photo.sizeBytes / 1024)} КБ) → ${targetKey}`,
        );
        if (dryRun) {
          shrunk += 1;
          bytesBefore += photo.sizeBytes;
          continue;
        }

        const { client, bucket } = storage!;
        const object = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: photo.storageKey }),
        );
        const source = Buffer.from(await object.Body!.transformToByteArray());
        const image = await toStorageImage(source);

        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: targetKey,
            Body: image.data,
            ContentType: 'image/webp',
          }),
        );
        // Указатель переводим только после успешной заливки: упасть между
        // ними значит оставить в базе ключ, которого в хранилище нет.
        await prisma.userPhoto.update({
          where: { id: photo.id },
          data: {
            storageKey: targetKey,
            width: image.width,
            height: image.height,
            sizeBytes: image.data.length,
          },
        });

        shrunk += 1;
        bytesBefore += photo.sizeBytes;
        bytesAfter += image.data.length;
      }

      if (scanned >= limit) break;
    }

    const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
    console.log(
      `Просмотрено фотографий: ${scanned}, ужато: ${shrunk} ` +
        `(предел ${MAX_IMAGE_DIMENSION}px)`,
    );
    if (shrunk > 0 && !dryRun) {
      console.log(`Было ${mb(bytesBefore)} МБ, стало ${mb(bytesAfter)} МБ`);
    }
    if (dryRun) {
      console.log(
        `Изменения не сохранялись; под ужатие попадает ${mb(bytesBefore)} МБ. ` +
          'Оригиналы останутся в хранилище и после настоящего прохода.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  backfillGallerySizes(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
