"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EyeOff, Pencil, X } from "lucide-react";
import type { MotivationAdminCandidateDto } from "@vedamatch/shared";
import { DeletePostButton } from "./delete-post-button";
import { LoadFailure } from "./load-failure";
import { useAdminCommand } from "./use-admin-command";
import {
  badgeClass,
  cardClass,
  fieldClass,
  labelClass,
  secondaryButton,
} from "./ui";

/**
 * Опубликованное: то, что люди уже читают в ленте.
 *
 * Раньше этого раздела не было вовсе — опубликованное лежало свёрнутым
 * списком в самом низу очереди, вперемешку с отклонённым и скрытым, и найти
 * вышедшую карточку можно было только развернув «Уже прошли очередь».
 *
 * Список, а не сетка карточек: сюда приходят с готовым вопросом — поправить
 * опечатку, снять с показа, удалить, — и разглядывать иллюстрации незачем.
 * Поиск по названию и цитате: за полгода публикаций пролистать до нужной
 * дороже, чем набрать три слова.
 */
export function MotivationPublishedList({
  posts,
}: {
  posts: MotivationAdminCandidateDto[] | null;
}) {
  const { pending, errors, run } = useAdminCommand();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const found = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");
    if (!needle || !posts) return posts ?? [];
    return posts.filter((post) =>
      [post.title, post.text, post.attributionSpeaker, post.categoryTitle]
        .filter(Boolean)
        .some((field) => field!.toLocaleLowerCase("ru-RU").includes(needle)),
    );
  }, [posts, query]);

  if (!posts) return <LoadFailure what="опубликованные вдохновения" />;

  if (posts.length === 0)
    return (
      <p className={`${cardClass} text-center text-text-2`}>
        Пока ничего не опубликовано. Всё, что ждёт проверки, — во вкладке
        «Заготовки».
      </p>
    );

  return (
    <>
      <label className="block max-w-md">
        <span className={labelClass}>Найти по названию, цитате или автору</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Например: Прабхупада"
          className={`${fieldClass} mt-1`}
        />
      </label>

      <p className="mt-3 text-sm text-text-2">
        {query.trim()
          ? `Найдено: ${found.length} из ${posts.length}`
          : `Опубликовано: ${posts.length}`}
      </p>

      {found.length === 0 ? (
        <p className={`${cardClass} mt-4 text-center text-text-2`}>
          Ничего не нашлось. Попробуйте другое слово.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {found.map((post) => (
            <li key={post.id} className={cardClass}>
              <div className="flex flex-wrap items-start gap-3">
                {post.imageUrl ? (
                  // Ссылка на хранилище подписана и может истечь — next/image
                  // не годится для произвольно меняющегося домена подписи.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 shrink-0 rounded-xl bg-bg-1" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-0">
                    {post.title || post.slug}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-text-1">
                    {post.text}
                  </p>
                  <p className="mt-1 text-xs text-text-2">
                    {post.contentDate} · {post.categoryTitle || post.category}
                    {post.attributionSpeaker
                      ? ` · ${post.attributionSpeaker}`
                      : ""}
                  </p>
                  {post.status === "hidden" && (
                    <span className={`${badgeClass} mt-1`}>Скрыто из ленты</span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {/* Открывает ленту прямо на этой карточке — тем же адресом,
                    что и переход из «Студии»: у админа один способ увидеть
                    публикацию глазами читателя. */}
                <Link
                  href={`/motivation?post=${encodeURIComponent(post.slug)}`}
                  className={secondaryButton}
                >
                  Открыть в ленте
                </Link>

                <button
                  type="button"
                  onClick={() =>
                    setEditing((current) =>
                      current === post.id ? null : post.id,
                    )
                  }
                  aria-expanded={editing === post.id}
                  className={secondaryButton}
                >
                  {editing === post.id ? (
                    <>
                      <X className="h-4 w-4" />
                      Не править
                    </>
                  ) : (
                    <>
                      <Pencil className="h-4 w-4" />
                      Править текст
                    </>
                  )}
                </button>

                {/* Скрыть, а не удалить: снятая с показа карточка уходит из
                    ленты, но остаётся у тех, кто уже сохранил её в избранном
                    как запись, — и решение можно отменить. */}
                <button
                  type="button"
                  disabled={pending[post.id] !== undefined}
                  onClick={() =>
                    run(post.id, "hide", {
                      path: `/admin/motivation/posts/${post.id}`,
                      method: "PATCH",
                      body: { hidden: post.status !== "hidden" },
                    })
                  }
                  className={secondaryButton}
                >
                  <EyeOff className="h-4 w-4" />
                  {post.status === "hidden" ? "Вернуть в ленту" : "Скрыть"}
                </button>

                <DeletePostButton
                  postId={post.id}
                  title={post.title || post.slug}
                  isPublished={post.status === "published"}
                  pendingAction={pending[post.id]}
                  run={run}
                />
              </div>

              {errors[post.id] && (
                <p role="alert" className="mt-2 text-sm font-medium text-red-500">
                  {errors[post.id]}
                </p>
              )}

              {editing === post.id && (
                <PublishedTextForm
                  post={post}
                  pendingAction={pending[post.id]}
                  onSaved={() => setEditing(null)}
                  run={run}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Правка названия и текста уже вышедшей карточки.
 *
 * Только русский: остальные языки заводит генерация, и подсовывать здесь
 * пустые поля под них значило бы предлагать перевести вручную то, что
 * переводится не здесь. Что не правится — цитата: у неё своя проверка
 * источника, и менять её задним числом мимо этой проверки нельзя.
 */
function PublishedTextForm({
  post,
  pendingAction,
  onSaved,
  run,
}: {
  post: MotivationAdminCandidateDto;
  pendingAction: string | undefined;
  onSaved: () => void;
  run: ReturnType<typeof useAdminCommand>["run"];
}) {
  const [title, setTitle] = useState(post.title);
  const [text, setText] = useState(post.text);
  const [storyText, setStoryText] = useState(post.storyText);

  const changed =
    title !== post.title || text !== post.text || storyText !== post.storyText;

  return (
    <div className="mt-3 space-y-3 border-t border-glass-brd pt-3">
      <label className="block">
        <span className={labelClass}>Заголовок</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={`${fieldClass} mt-1`}
        />
      </label>

      <label className="block">
        <span className={labelClass}>Пояснение</span>
        <textarea
          value={text}
          rows={4}
          onChange={(event) => setText(event.target.value)}
          className={`${fieldClass} mt-1`}
        />
      </label>

      <label className="block">
        <span className={labelClass}>Подпись на картинке</span>
        <textarea
          value={storyText}
          rows={2}
          onChange={(event) => setStoryText(event.target.value)}
          className={`${fieldClass} mt-1`}
        />
      </label>

      <button
        type="button"
        disabled={!changed || pendingAction !== undefined}
        onClick={async () => {
          await run(post.id, "edit", {
            path: `/admin/motivation/posts/${post.id}`,
            method: "PATCH",
            body: { translations: { ru: { title, text, storyText } } },
          });
          onSaved();
        }}
        className={secondaryButton}
      >
        {pendingAction === "edit" ? "Сохраняем…" : "Сохранить"}
      </button>
    </div>
  );
}
