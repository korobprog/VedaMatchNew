import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryLink } from "@/components/motivation/feed-style";
import { getPublicMotivationPost } from "@/lib/motivation-api";
import {
  OG_IMAGE_TYPE,
  ogImagePath,
  ogImageSource,
  ogPreviewSize,
} from "@/lib/motivation-og-image";
import { probeImageSize } from "@/lib/motivation-og-probe";
import { buildShareMeta } from "./share-meta";

/**
 * Карточка ссылки в мессенджерах. У рилса с роликом отдаём и видео: без
 * `og:video` Telegram и WhatsApp показывают только неподвижный кадр, а ссылка
 * на рилс должна разворачиваться в рилс.
 *
 * Картинка превью — не сам сторис-кадр, а его лёгкая JPEG-копия со своего
 * домена (VED-201): PNG на 5 МБ разворачивал только Max.
 *
 * Заголовок и описание превью — из `buildShareMeta()` (VED-201б): раньше
 * `description` был полным текстом цитаты, тем же, что уже уходит в тело
 * сообщения при «Поделиться» (`share-targets.ts`) — мессенджер показывал её
 * дважды. `<title>` страницы (ниже) при этом не меняется: то, что видно на
 * вкладке браузера и на самой странице, — отдельно от превью-карточки.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublicMotivationPost(slug);
  if (!post) return { title: "VedaMatch Inspiration" };
  const { title: shareTitle, description } = buildShareMeta(post);
  const source = ogImageSource(post);
  const poster = source ? ogImagePath(slug) : null;
  // Размер превью (VED-357): картинка повторяет пропорции исходника, поэтому
  // страница узнаёт его размер по заголовку файла и считает кадр той же
  // функцией, что и маршрут `/m/[slug]/og`. Не узнали — размеры не
  // объявляем: бот прочтёт их из самого файла.
  const sourceSize = source ? await probeImageSize(source) : null;
  const previewSize = sourceSize ? ogPreviewSize(sourceSize) : null;
  return {
    title: `${post.title} — Inspiration`,
    description,
    openGraph: {
      type: post.videoUrl ? "video.other" : "article",
      title: shareTitle,
      description,
      // Размеры объявлены, когда известны (VED-357): с ними WhatsApp
      // показывал превью крупно, во всю ширину пузыря (PR #360). Кадр —
      // сама иллюстрация в своих пропорциях, без полей и без обрезки.
      images: poster
        ? [
            {
              url: poster,
              type: OG_IMAGE_TYPE,
              ...(previewSize ?? {}),
              alt: shareTitle,
            },
          ]
        : [],
      ...(post.videoUrl
        ? { videos: [{ url: post.videoUrl, type: "video/mp4", width: 1080, height: 1920 }] }
        : {}),
    },
    twitter: {
      card: post.videoUrl ? "player" : "summary_large_image",
      title: shareTitle,
      description,
      images: poster ? [poster] : [],
    },
  };
}

export default async function PublicMotivationPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublicMotivationPost(slug);
  if (!post) notFound();
  // Категория у каждого афоризма (VED-120): под меткой сервиса, ссылкой на
  // ленту своей папки. Гостя вход перехватит и вернёт туда же.
  const category = categoryLink(post);
  return <main className="min-h-dvh bg-bg-0 px-4 py-10 text-text-0"><article className="glass mx-auto max-w-2xl overflow-hidden rounded-3xl shadow-2xl">{post.videoUrl ? (
    // Постер обязателен: без него на время загрузки зритель видит пустой
    // прямоугольник вместо кадра. muted — иначе браузер не даст автозапуск.
    <video src={post.videoUrl} poster={post.storyImageUrl || post.imageUrl} autoPlay muted loop playsInline className="aspect-[9/16] w-full bg-bg-1 object-cover" />
  ) : (
    /* Картинка целиком, а не обрезанная под 4:3 (VED-201): открытку приносят
       готовым файлом любой формы, и `object-cover` срезал у неё края вместе с
       напечатанной надписью — на скриншоте из карточки у картинки не хватало
       верхней строки. Высота ограничена, чтобы вертикальная не занимала весь
       экран и кнопки под ней оставались видны. */
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={post.imageUrl} alt={post.title} className="max-h-[70vh] w-full bg-bg-1 object-contain" />
  )}<div className="p-6 sm:p-10"><p className="text-sm font-semibold uppercase tracking-widest text-gold">VedaMatch Motivation</p>{category && <Link href={category.href} aria-label={`Категория: ${category.title}`} className="glass mt-3 inline-flex items-center gap-1.5 rounded-full border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0"><span aria-hidden="true">📂</span>{category.title}</Link>}<h1 className="mt-3 text-3xl font-bold">{post.title}</h1><p className="mt-5 whitespace-pre-line text-lg leading-8 text-text-1">{post.text}</p>{post.attributionSpeaker && <p className="mt-6 border-l-2 border-gold pl-4 text-sm text-text-2">{post.attributionSpeaker}{post.attributionWork ? ` · ${post.attributionWork}` : ""}</p>}<div className="mt-8 grid gap-3 sm:grid-cols-2"><a href={post.storyImageUrl} download className="rounded-xl border border-gold px-5 py-3 text-center font-medium text-gold">Скачать для Stories</a><Link href="/login" className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-5 py-3 text-center font-medium text-white">Войти или зарегистрироваться в VedaMatch</Link></div></div></article></main>;
}
