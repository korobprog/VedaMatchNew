import { getPublicMotivationPost } from "@/lib/motivation-api";
import { clientHeaders, storyFileName } from "./story-file";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * Картинка афоризма для «Сохранить картинку» и «Отправить в приложение» — со
 * своего домена и сразу «в галерею».
 *
 * Медиа лежит в объектном хранилище на отдельном домене, и это ломает ровно
 * то, ради чего картинку и берут — истории и статусы:
 *
 * 1. Атрибут `download` браузер соблюдает только для своего домена. На чужой
 *    он его игнорирует и просто открывает картинку в соседней вкладке.
 * 2. `navigator.share({files})` требует сначала прочитать файл через `fetch`,
 *    а межсайтовый запрос к хранилищу упрётся в CORS.
 *
 * Сам файл собирает API (`motivation/posts/:slug/saved-image`) по текущей
 * вёрстке: знак в углу, подпись справа, «Скачано с VedaMatch.ru» (VED-227,
 * VED-247). Раньше здесь отдавался хранимый кадр сторис — у постов, собранных
 * до правки, он оставался старым, и заказчик видел прежнюю раскладку. И это
 * был PNG на 4–5 МБ, из-за которого «Отправить в приложение» ждало по десять
 * секунд на мобильной сети (VED-156); теперь JPEG в разы легче.
 *
 * Адрес публичный, как и сама `/m/<slug>`: картинкой делятся с теми, у кого
 * аккаунта ещё нет.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const upstream = await savedImage(slug, request.headers);
  if (upstream === "missing") return new Response("Not found", { status: 404 });
  if (!upstream) {
    // Хранилище или API молчат: пустой файл в галерее хуже честной ошибки —
    // по нему не понять, что пошло не так.
    return new Response("Upstream unavailable", { status: 502 });
  }

  const type = upstream.headers.get("content-type") ?? "image/jpeg";
  const length = upstream.headers.get("content-length");
  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      ...(length ? { "Content-Length": length } : {}),
      "Content-Disposition": `attachment; filename="${storyFileName(slug, type)}"`,
      // Файл меняется вместе с вёрсткой и правкой поста: короткий кэш снимает
      // повторные запросы и не держит старую картинку после выката.
      "Cache-Control": "public, max-age=300",
    },
  });
}

/**
 * Файл от API; если API недоступен — прежний хранимый кадр, чтобы кнопка не
 * ломалась целиком из-за сбоя сборки.
 */
async function savedImage(
  slug: string,
  headers: Headers,
): Promise<Response | "missing" | null> {
  try {
    const response = await fetch(
      `${API_URL}/motivation/posts/${encodeURIComponent(slug)}/saved-image`,
      { headers: clientHeaders(headers), cache: "no-store" },
    );
    if (response.status === 404) return "missing";
    if (response.ok && response.body) return response;
  } catch {
    // Упадём на хранимый кадр ниже.
  }
  const post = await getPublicMotivationPost(slug).catch(() => null);
  const source = post?.storyImageUrl || post?.imageUrl;
  if (!source) return post ? "missing" : null;
  const fallback = await fetch(source).catch(() => null);
  return fallback?.ok && fallback.body ? fallback : null;
}
