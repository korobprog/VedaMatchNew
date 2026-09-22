import sharp from "sharp";
import { getPublicMotivationPost } from "@/lib/motivation-api";
import {
  OG_BACKDROP_BLUR,
  OG_BACKDROP_BRIGHTNESS,
  OG_BACKDROP_FALLBACK,
  OG_IMAGE_TYPE,
  encodeWithinLimit,
  ogBackdropSampleSize,
  ogImageSource,
  ogPreviewLayout,
} from "@/lib/motivation-og-image";

export const runtime = "nodejs";

/**
 * Превью ссылки для мессенджеров (VED-201, VED-357) — лёгкий JPEG вместо
 * пятимегабайтного PNG сторис. Почему кадр именно такой, см.
 * `motivation-og-image.ts`.
 *
 * В кадре — сама иллюстрация целиком, без обрезки и без единой надписи, на
 * размытой копии себя самой. Раньше здесь стоял `fit: 'cover'` под жёсткие
 * 9:16, и у открытки, принесённой готовым файлом, срезало бока вместе с
 * надписью; потом кадр повторял пропорции исходника — и вертикальную
 * карточку WhatsApp свернул в миниатюру сбоку. Теперь кадр всегда альбомный
 * 1200×630, а картинка в него вписана.
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

    const layout = ogPreviewLayout({ width: meta.width, height: meta.height });
    const sample = ogBackdropSampleSize();

    // Подложка в два шага: сначала крошечная копия — её и размываем, потому
    // что размытие стоит квадрат радиуса, — потом растягиваем до кадра.
    // Одной цепочкой это не собрать: второй `resize` в sharp отменяет первый.
    const blurred = await sharp(upright)
      .resize(sample.width, sample.height, { fit: "cover" })
      .blur(OG_BACKDROP_BLUR)
      .modulate({ brightness: OG_BACKDROP_BRIGHTNESS })
      .toBuffer();
    const backdrop = await sharp(blurred)
      .resize(layout.frame.width, layout.frame.height, { fit: "fill" })
      // Края исходника могли быть прозрачными — под ними нужен свой фон,
      // иначе при переводе в JPEG они станут чёрными пятнами.
      .flatten({ background: OG_BACKDROP_FALLBACK })
      .toBuffer();

    // Сама иллюстрация: вписана целиком, пропорции исходника сохранены.
    // Прозрачность не гасим — сквозь неё видно ту же картинку, размытую.
    const art = await sharp(upright)
      .resize(layout.art.width, layout.art.height, { fit: "fill" })
      .toBuffer();

    const frame = await sharp(backdrop)
      .composite([{ input: art, left: layout.left, top: layout.top }])
      .toBuffer();

    // Кадр собран один раз, в лестницу уходит только сжатие: размер кадра
    // постоянный, потому что он объявлен в `og:image:width`/`height`.
    ({ bytes } = await encodeWithinLimit(async ({ quality }) =>
      sharp(frame)
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
