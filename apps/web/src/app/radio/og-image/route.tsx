import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getSharedRadioTrack } from "@/lib/music-radio-server-api";
import { sharedTrackTitle } from "@/lib/radio-share-meta";

export const runtime = "nodejs";

/**
 * Собственная карточка записи для превью ссылки (VED-718): название с
 * исполнителем на своём кадре. Показывается, когда у записи нет обложки: без
 * картинки мессенджер рисует заглушку с логотипом сайта, а карточки VedaMatch
 * в превью быть не должно.
 *
 * Кадр — свой домен и лёгкий JPEG, как у «Вдохновения» (`/m/[slug]/og`).
 * Адрес публичный: бот приходит без cookie, и `/radio/og-image` открыт гостю
 * в `proxy.ts`.
 */
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

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

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("track");
  const shared = id ? await getSharedRadioTrack(id) : null;
  const track = shared?.track ?? null;
  const fontData = loadFont();
  if (!track || !fontData) return new Response("Not found", { status: 404 });

  const title = sharedTrackTitle(track);
  const artist = track.artist?.name ?? track.artistCredit ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background:
            "linear-gradient(135deg, #0A0614 0%, #1B2A4A 55%, #123A3C 100%)",
          color: "#FFFFFF",
          fontFamily: "Noto Sans",
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
    ),
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fonts: [{ name: "Noto Sans", data: fontData, weight: 400, style: "normal" }],
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
