import sharp from "sharp";
import { getPublicMotivationPost } from "@/lib/motivation-api";
import {
  OG_IMAGE_TYPE,
  OG_TRANSPARENT_FALLBACK,
  encodeWithinLimit,
  ogImageSource,
  ogPreviewSize,
} from "@/lib/motivation-og-image";

export const runtime = "nodejs";

/**
 * Превью ссылки для мессенджеров (VED-201, VED-357) — лёгкий JPEG вместо
 * многомегабайтного исходника. Почему кадр именно такой и что пробовали до
 * этого, см. `motivation-og-image.ts`.
 *
 * В кадре — сама иллюстрация целиком, в своих пропорциях, без полей, без
 * обрезки и без единой надписи. Размер кадра считает `ogPreviewSize()` — та
 * же функция, по которой страница объявляет `og:image:width`/`height`.
 *
 * Адрес публичный: бот Telegram, WhatsApp, Max или ВКонтакте приходит без
 * cookie, а префикс `/m/` открыт гостю в proxy.ts.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const post = await getPublicMotivationPost(slug);
  const source = post ? ogImageSource(post) : null;
  if (!source) return new Response("Not found", { status: 404 });

  const upstream = await fetch(source, { signal: AbortSignal.timeout(20_000) });
  if (!upstream.ok) return new Response("Upstream unavailable", { status: 502 });
  const original = Buffer.from(await upstream.arrayBuffer());

  let bytes: Uint8Array;
  try {
    // Размер — уже с поворотом по EXIF: у кадра с телефона ширина и высота
    // в метаданных записаны до поворота, и кадр вышел бы боком. Страница
    // читает размер из заголовка с той же поправкой (`imageSizeFromHeader`).
    const meta = await sharp(original).metadata();
    const { width, height } = meta.autoOrient;
    if (!width || !height) throw new Error("no dimensions");

    const size = ogPreviewSize({ width, height });
    // `fill` здесь не искажает: размер посчитан из пропорций самой картинки,
    // расхождение — доли пикселя на округлении. Зато файл совпадает с
    // объявленным в метатегах до точки, чего `inside` не гарантирует.
    // Промежуточный кадр — сырые пиксели: без лишнего пережатия и быстро.
    const { data, info } = await sharp(original)
      .rotate()
      .resize(size.width, size.height, { fit: "fill" })
      // Прозрачные края исходника при переводе в JPEG стали бы чёрными.
      .flatten({ background: OG_TRANSPARENT_FALLBACK })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const raw = {
      width: info.width,
      height: info.height,
      channels: info.channels,
    };

    // Кадр собран один раз, в лестницу уходит только сжатие.
    ({ bytes } = await encodeWithinLimit(async ({ quality }) =>
      sharp(data, { raw })
        // Базовый (не прогрессивный) JPEG: так его разбирают все боты.
        // `mozjpeg: true` здесь не годится — он включает прогрессивную
        // развёртку, поэтому берём из его набора только сжатие.
        .jpeg({
          quality,
          progressive: false,
          trellisQuantisation: true,
          overshootDeringing: true,
        })
        .toBuffer(),
    ));
  } catch {
    return new Response("Unable to render preview", { status: 502 });
  }

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": OG_IMAGE_TYPE,
      "Content-Length": String(bytes.byteLength),
      // Без Content-Disposition: attachment — это картинка для показа.
      // Кадр опубликованного афоризма не меняется; сутки кэша снимают
      // повторное перекодирование, когда ссылку разворачивают снова.
      "Cache-Control": "public, max-age=86400",
    },
  });
}
