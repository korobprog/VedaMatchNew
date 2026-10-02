import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { getSharedRadioTrack } from "@/lib/music-radio-server-api";
import {
  OG_CARD_HEIGHT,
  OG_CARD_WIDTH,
  sharedTrackTitle,
} from "@/lib/radio-share-meta";
import { toInternalStorageUrl } from "@/lib/storage-internal-url";

export const runtime = "nodejs";

/**
 * Собственная карточка записи для превью ссылки (VED-718): название с
 * исполнителем и её обложка на своём кадре. Обложка вшивается в кадр, а не
 * отдаётся как `og:image` напрямую: у записи она лежит в хранилище за
 * подписью со сроком жизни, и мессенджер, пришедший за превью через часы,
 * получал бы 403 — картинки в превью не было вовсе. Карточка же живёт на
 * своём домене, без подписи, и ещё и называет запись.
 *
 * Кадр — свой домен и лёгкий JPEG, как у «Вдохновения» (`/m/[slug]/og`).
 * Адрес публичный: бот приходит без cookie, и `/radio/og-image` открыт гостю
 * в `proxy.ts`.
 */
const CARD_WIDTH = OG_CARD_WIDTH;
const CARD_HEIGHT = OG_CARD_HEIGHT;

/** Обложка в кадре — квадратная панель справа, вписываемая без обрезки. */
const COVER_PANEL = 640;

/**
 * Шрифт с кириллицей. Карточку рисует `next/og` со своим растеризатором:
 * системных шрифтов в образе (alpine) нет, и без файла текст не нарисуется.
 * Из `public/` — потому что этот каталог есть и в рабочем образе.
 */
let font: Buffer | null = null;
function loadFont(): Buffer | null {
  if (font) return font;
  try {
    font = readFileSync(
      join(process.cwd(), "public", "brand", "NotoSans-Regular.ttf"),
    );
    return font;
  } catch {
    // Файл потерялся — карточку без надписей не отдаём: лучше пустое превью,
    // чем кадр, который ничего не говорит о записи.
    return null;
  }
}

/**
 * Обложка записи в data-URI для кадра. Спрашивается по внутреннему адресу
 * хранилища (`toInternalStorageUrl`) — с сервера сайта до публичного домена
 * не добраться. Любая беда с обложкой не должна ронять карточку: остаёмся
 * на текстовом кадре.
 */
async function loadCoverDataUri(
  coverUrl: string | null | undefined,
): Promise<string | null> {
  if (!coverUrl) return null;
  try {
    const res = await fetch(toInternalStorageUrl(coverUrl), {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const source = Buffer.from(await res.arrayBuffer());
    const resized = await sharp(source)
      .rotate()
      .resize(COVER_PANEL, COVER_PANEL, { fit: "inside" })
      .flatten({ background: "#0A0614" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${resized.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("track");
  const shared = id ? await getSharedRadioTrack(id) : null;
  const track = shared?.track ?? null;
  const fontData = loadFont();
  if (!track || !fontData) return new Response("Not found", { status: 404 });

  const title = sharedTrackTitle(track);
  const artist = track.artist?.name ?? track.artistCredit ?? null;
  const cover = await loadCoverDataUri(track.coverUrl);

  const card = await new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: cover ? "row" : "column",
          background:
            "linear-gradient(135deg, #0A0614 0%, #1B2A4A 55%, #123A3C 100%)",
          color: "#FFFFFF",
          fontFamily: "Noto Sans",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 80,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 26,
              letterSpacing: 12,
              color: "#7FD1C2",
            }}
          >
            РАДИО
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: title.length > 42 ? 52 : 72,
              lineHeight: 1.15,
            }}
          >
            {track.title}
          </div>
          {artist && (
            <div
              style={{
                display: "flex",
                marginTop: 24,
                fontSize: 40,
                color: "#B9C6DD",
              }}
            >
              {artist}
            </div>
          )}
        </div>
        {cover && (
          <div
            style={{
              width: 520,
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={cover}
              width="480"
              height="480"
              style={{ objectFit: "contain" }}
            />
          </div>
        )}
      </div>
    ),
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fonts: [{ name: "Noto Sans", data: fontData, weight: 400, style: "normal" }],
    },
  ).arrayBuffer();

  // Лёгкий JPEG без альфа-канала — такой кадр одинаково переваривают и
  // Телеграм, и WhatsApp, и МАХ (см. док-блок выше).
  const jpeg = await sharp(Buffer.from(card)).jpeg({ quality: 82 }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
