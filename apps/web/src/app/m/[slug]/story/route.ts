import { getPublicMotivationPost } from "@/lib/motivation-api";

/**
 * Готовая картинка афоризма — со своего домена и сразу «в галерею».
 *
 * Медиа лежит в объектном хранилище на отдельном домене, и это ломает ровно
 * то, ради чего картинку и берут — истории и статусы:
 *
 * 1. Атрибут `download` браузер соблюдает только для своего домена. На чужой
 *    он его игнорирует и просто открывает картинку в соседней вкладке —
 *    сохранять её человеку приходится вручную, долгим нажатием.
 * 2. `navigator.share({files})` требует сначала прочитать файл через `fetch`,
 *    а межсайтовый запрос к хранилищу упрётся в CORS.
 *
 * Оба случая лечит один маршрут: страница и файл оказываются на одном домене.
 * Истории и статусы ссылку не принимают вовсе — им нужен файл, поэтому без
 * этого маршрута «поделиться в сторис» не работает никак.
 *
 * Адрес публичный, как и сама `/m/<slug>`: картинкой делятся с теми, у кого
 * аккаунта ещё нет.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const post = await getPublicMotivationPost(slug);
  const source = post?.storyImageUrl || post?.imageUrl;
  if (!source) return new Response("Not found", { status: 404 });

  const upstream = await fetch(source);
  if (!upstream.ok || !upstream.body) {
    // Хранилище молчит или подпись истекла: пустой файл в галерее хуже
    // честной ошибки — по нему не понять, что пошло не так.
    return new Response("Upstream unavailable", { status: 502 });
  }

  const type = upstream.headers.get("content-type") ?? "image/jpeg";
  const extension = type.includes("png") ? "png" : "jpg";
  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      // Имя файла человеку в галерее: «vedamatch-<slug>.jpg» узнаётся, а
      // случайный ключ хранилища — нет.
      "Content-Disposition": `attachment; filename="vedamatch-${slug}.${extension}"`,
      // Картинка у опубликованного афоризма не меняется, но подпись в
      // хранилище живёт недолго — час кэша снимает повторные запросы и не
      // переживает смену адреса надолго.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
