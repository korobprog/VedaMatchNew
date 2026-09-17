import sharp from "sharp";
import { getPublicMotivationPost } from "@/lib/motivation-api";
import {
  OG_IMAGE_TYPE,
  encodeWithinLimit,
  ogImageSource,
} from "@/lib/motivation-og-image";

export const runtime = "nodejs";

/**
 * Превью афоризма для мессенджеров (VED-201) — лёгкий JPEG вместо
 * пятимегабайтного PNG сторис. Почему это нужно, см. motivation-og-image.ts.
 *
 * Адрес публичный: бот Telegram, WhatsApp или ВКонтакте приходит без
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
    ({ bytes } = await encodeWithinLimit(({ width, height, quality }) =>
      sharp(original)
        .rotate()
        .resize(width, height, { fit: "cover", position: "attention" })
        // У JPEG нет прозрачности: без подложки прозрачные края стали бы чёрными
        // пятнами непредсказуемой формы — берём фон сторис.
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
