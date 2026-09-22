import sharp from "sharp";
import { getPublicMotivationPost } from "@/lib/motivation-api";
import {
  OG_IMAGE_TYPE,
  encodeWithinLimit,
  ogImageSource,
  ogPreviewSize,
} from "@/lib/motivation-og-image";

export const runtime = "nodejs";

/**
 * Превью ссылки для мессенджеров (VED-201) — лёгкий JPEG вместо
 * пятимегабайтного PNG сторис. Почему это нужно и как считается кадр, см.
 * `motivation-og-image.ts`.
 *
 * В кадре — сама иллюстрация целиком, без обрезки и без единой надписи.
 * Раньше здесь стоял `fit: 'cover'` под жёсткие 9:16, и у открытки,
 * принесённой готовым файлом, срезало бока вместе с надписью. А до третьего
 * захода по карточке сюда шёл ещё и сторис-кадр с впечатанной цитатой плюс
 * полоса с подписью бренда снизу — владелец попросил «чистую от текста
 * картинку, а сам текст сверху или снизу», как показывает Max.
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
    // `rotate()` до замера: у кадра с телефона ширина и высота в метаданных
    // записаны до поворота по EXIF, и раскладка вышла бы боком.
    const upright = await sharp(original).rotate().toBuffer();
    const meta = await sharp(upright).metadata();
    if (!meta.width || !meta.height) throw new Error("no dimensions");

    ({ bytes } = await encodeWithinLimit(async ({ scale, quality }) => {
      const size = ogPreviewSize(
        { width: meta.width!, height: meta.height! },
        { scale },
      );
      return (
        sharp(upright)
          // `inside` вместо `cover`: картинка вписывается целиком. Размеры
          // кадра посчитаны из её же пропорций, так что полей не остаётся.
          .resize(size.width, size.height, { fit: "inside" })
          // Фон сторис под прозрачными краями: у JPEG нет прозрачности, и без
          // подложки они стали бы чёрными пятнами непредсказуемой формы.
          .flatten({ background: "#0A0614" })
          // Базовый (не прогрессивный) JPEG: так его разбирают все боты.
          // `mozjpeg: true` здесь не годится — он включает прогрессивную
          // развёртку, поэтому берём из его набора только сжатие.
          .jpeg({
            quality,
            progressive: false,
            trellisQuantisation: true,
            overshootDeringing: true,
          })
          .toBuffer()
      );
    }));
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
