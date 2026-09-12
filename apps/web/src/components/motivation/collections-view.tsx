"use client";

import { useState } from "react";
import Link from "next/link";
import type { MotivationCategoryDto, MotivationPostDto } from "@vedamatch/shared";

/**
 * Папки готовых карточек: разделы и подразделы, за каждым — сетка картинок.
 *
 * Лента отвечает на «покажи что-нибудь», а это — на «покажи про Веды»: за
 * вторым в ленту не ходят, там нет ни оглавления, ни возврата к тому, что
 * листал вчера. Поэтому отдельный экран, а не фильтр внутри ленты.
 *
 * Сетка картинок, а не список: карточка вдохновения — это картинка с
 * подписью, и узнают её именно по картинке. Подпись остаётся ради
 * скринридера и тех, у кого картинка не загрузилась.
 *
 * Пустые разделы показываются наравне с наполненными — это оглавление
 * сервиса, и заведённый редакцией раздел человек должен здесь найти. Но
 * ссылкой пустой раздел не становится: за ней тупик со словами «пока пусто»,
 * а нулём рядом с названием то же самое сказано, не заставляя туда идти.
 */
export function MotivationCollections({
  categories,
}: {
  categories: MotivationCategoryDto[];
}) {
  const roots = categories.filter((category) => !category.parentId);
  /* Выбор нескольких папок сразу (VED-22). Раньше экран умел только «открыть
     одну», а просили смотреть несколько. Отметки живут здесь, а не в адресе:
     пока человек ставит галочки, он ещё никуда не пошёл, и переписывать адрес
     на каждую — значит гонять страницу туда-сюда. В адрес они уезжают одним
     разом, по нажатию «Смотреть». */
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (slug: string) =>
    setPicked((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug],
    );

  if (roots.length === 0)
    return (
      <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-2">
        Разделов пока нет. Всё опубликованное — в ленте.
      </p>
    );

  /* Галочка рядом с названием, а не вместо ссылки: открыть одну папку — по-
     прежнему одно нажатие по названию, и привычка не ломается. */
  const pick = (slug: string, title: string) => (
    <label className="inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        checked={picked.includes(slug)}
        onChange={() => toggle(slug)}
        className="size-4 accent-cyan"
      />
      <span className="sr-only">Смотреть «{title}» вместе с другими</span>
    </label>
  );

  return (
    <div className="space-y-6 pb-24">
      {/* Экран открывался списком неизвестно чего: заголовок сверху называет
          раздел, но не говорит, что с ним делать, а разделы без подписи
          читаются как перечень, а не как выбор. Строка объясняет — и она же
          первое, что читает скринридер перед списком.

          Абзац, а не заголовок: это указание, а не название раздела, и
          заголовком оно ломало бы порядок h1 → h2 у самих категорий. */}
      <p className="text-sm text-text-1">
        Выберите категорию для просмотра. Галочками можно отметить несколько
        сразу.
      </p>
      {roots.map((root) => {
        const children = categories.filter(
          (category) => category.parentId === root.id,
        );
        return (
          <section key={root.id}>
            <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-text-0">
              {root.postCount > 0 ? (
                <Link
                  href={`/motivation/collections/${root.slug}`}
                  className="hover:text-cyan"
                >
                  {root.title}
                </Link>
              ) : (
                <span className="text-text-2">{root.title}</span>
              )}
              <span className="font-mono text-xs font-medium text-text-2">
                {root.postCount}
              </span>
              {/* Пустую папку отмечать нечем: за ней ничего не покажут. */}
              {root.postCount > 0 && pick(root.slug, root.title)}
            </h2>
            {children.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {children.map((child) => (
                  <li key={child.id}>
                    {child.postCount > 0 ? (
                      <span className="glass inline-flex items-center gap-1.5 rounded-full border border-glass-brd px-3 py-1.5 text-sm text-text-1">
                        <Link
                          href={`/motivation/collections/${child.slug}`}
                          className="hover:text-text-0"
                        >
                          {child.title}
                        </Link>
                        <span className="font-mono text-xs text-text-2">
                          {child.postCount}
                        </span>
                        {pick(child.slug, child.title)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-glass-brd px-3 py-1.5 text-sm text-text-2">
                        {child.title}
                        <span className="font-mono text-xs">
                          {child.postCount}
                        </span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {/* Полоса появляется только когда есть что смотреть: пустая кнопка
          «Смотреть» на экране выбора обещает переход в никуда. Выбранные
          папки уезжают в адрес одним параметром через запятую — ссылку на
          такую подборку можно переслать, и она откроется тем же набором. */}
      {picked.length > 0 && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-center gap-3 border-t border-glass-brd bg-bg-1/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
        >
          <Link
            href={`/motivation?category=${picked
              .map((slug) => encodeURIComponent(slug))
              .join(",")}`}
            className="rounded-xl bg-magenta px-4 py-2 text-sm font-semibold text-white"
          >
            Смотреть выбранное: {picked.length}
          </Link>
          <button
            type="button"
            onClick={() => setPicked([])}
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
          >
            Снять отметки
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Карточки одной папки.
 *
 * Ссылка ведёт в ленту, открытую на этой карточке, а не на отдельную
 * страницу поста: смотреть вдохновение умеет лента — там и звук, и
 * пояснение, и «сохранить», — а второй экран показа расходился бы с ней
 * возможностями.
 */
export function MotivationCollectionGrid({
  posts,
  category,
  variant = "image",
  empty,
}: {
  posts: MotivationPostDto[];
  /**
   * Что показывать в плитке. `image` — иллюстрация, `story` — готовый
   * оформленный афоризм: та же картинка с вшитым текстом, подписью и знаком
   * сервиса, которую отдают в сторис. Второй режим отвечает на «покажи, что
   * можно переслать», первый — на «покажи, про что это».
   */
  variant?: "image" | "story";
  /**
   * Слаг папки, из которой открывают карточку. Уезжает в ленту вместе с
   * постом: открыв «Пословицы», человек ждёт, что дальше листаются
   * пословицы, а не вся база — иначе папка была бы просто витриной, из
   * которой выпадают в общую ленту и обратно не находят дорогу.
   */
  category?: string;
  /**
   * Что написать, когда показывать нечего. Общее «пока пусто» врёт, когда
   * пуст только вид: в папке может лежать полсотни афоризмов, просто ни
   * одного на фотографии.
   */
  empty?: string;
}) {
  if (posts.length === 0)
    return (
      <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-2">
        {empty ?? "В этом разделе пока пусто."}
      </p>
    );

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {posts.map((post) => (
        <li key={post.id}>
          <Link
            href={`/motivation?post=${encodeURIComponent(post.slug)}${
              category ? `&category=${encodeURIComponent(category)}` : ""
            }`}
            className="group block overflow-hidden rounded-xl border border-glass-brd"
          >
            {/* Ссылка на хранилище подписана и может истечь — next/image не
                годится для произвольно меняющегося домена подписи. */}
            {/* У оформленного афоризма пропорции сторис, а не витрины: обрежь
                его под 3/4 — и первыми уйдут вшитые сверху и снизу подпись со
                знаком сервиса. Если оформленной картинки у поста нет (её
                делает воркер, и он мог не дойти), показываем иллюстрацию:
                дырка в сетке хуже, чем плитка не того вида. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                variant === "story" && post.storyImageUrl
                  ? post.storyImageUrl
                  : post.imageUrl
              }
              alt=""
              loading="lazy"
              /* Готовую открытку (VED-87) не обрезаем: надпись на ней идёт
                 до краёв, и плитка показывала бы полфразы. Поля заливает фон. */
              className={`w-full transition-transform group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${
                post.captionInImage ? "bg-bg-2 object-contain" : "object-cover"
              } ${variant === "story" ? "aspect-[9/16]" : "aspect-[3/4]"}`}
            />
            {/* У афоризма участника заголовок — название книги; подписываем
                началом самой цитаты, как и остальные плитки — смыслом. */}
            <span className="block truncate px-2 py-1.5 text-xs text-text-1">
              {post.origin === "user"
                ? post.storyText || post.text.split("\n")[0]
                : post.title || post.storyText}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
