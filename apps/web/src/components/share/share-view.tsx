"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { copyText } from "@/lib/copy-text";
import { detectDisplayMode } from "@/lib/pwa/browser";
import {
  MESSENGER_LABELS,
  MESSENGERS,
  isOwnFile,
  messengerAppLink,
  messengerLink,
  opensInApp,
  shareText,
  shouldFallBackToSite,
  type MessengerId,
} from "./share-targets";
import { shareFileName, toJpeg } from "./share-file";

/**
 * Экран «Поделиться»: две дороги, а не общий список кнопок.
 *
 * Истории и статусы принимают только файл — Instagram Stories, статус
 * WhatsApp, истории Telegram и ВКонтакте ссылку не разворачивают вовсе.
 * Переписка наоборот живёт ссылкой: она показывает превью и ведёт обратно в
 * портал. Сваленные в один ряд, эти кнопки обещали бы одно, а делали разное,
 * поэтому они разведены по двум блокам с честными подписями.
 */
export function ShareView({
  text,
  source,
  sourceInPreview = false,
  link,
  previewUrl,
  filePath,
  chatHref,
}: {
  text: string;
  source: string | null;
  /**
   * Строка источника уже стоит заголовком превью самой ссылки — тогда в тело
   * сообщения её дописывать нельзя (VED-357: «Исключи любой дубляж текста при
   * отображении рилса во время пересылки»). На экране она всё равно видна, и
   * в карточку для чата уезжает как была: дубль возникает только в
   * мессенджере, где строка стоит и в тексте, и заголовком превью.
   *
   * Знает об этом только сервис: что попадёт в заголовок превью, решает его
   * собственный `generateMetadata()`, а этот экран портальный и чужих
   * метатегов не читает.
   */
  sourceInPreview?: boolean;
  link: string;
  previewUrl: string | null;
  /** Путь к файлу на нашем домене; null — картинки у карточки нет. */
  filePath: string | null;
  chatHref: string | null;
}) {
  const [copied, setCopied] = useState<"text" | "link" | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** Картинка, готовая к отдаче: скачана и переведена в JPEG заранее. */
  const [prepared, setPrepared] = useState<{ file: File; url: string } | null>(
    null,
  );
  /** Источник для тела сообщения: пусто, если он уже в заголовке превью. */
  const messageSource = sourceInPreview ? null : source;
  const message = shareText({ text, source: messageSource, link });
  const file = isOwnFile(filePath) ? filePath : null;

  /* Готовим картинку сразу при открытии экрана (VED-156): шторка
     открывается, только пока браузер помнит нажатие, и скачивание уже после
     него на мобильной сети в это окно не укладывалось. Не вышло — кнопки
     работают по-старому, со скачиванием по нажатию. */
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let url: string | null = null;
    void (async () => {
      try {
        const response = await fetch(file);
        if (!response.ok) return;
        const jpeg = await toJpeg(await response.blob());
        if (cancelled) return;
        const ready = new File([jpeg], shareFileName(file, jpeg.type), {
          type: jpeg.type,
        });
        url = URL.createObjectURL(ready);
        setPrepared({ file: ready, url });
      } catch {
        // Сеть или формат — останется запасной путь по нажатию.
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  async function copy(what: "text" | "link") {
    // Не скопировалось ни одним способом — текст остаётся на экране, его
    // можно выделить руками.
    if (!(await copyText(what === "text" ? message : link))) return;
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  }

  /**
   * Отдать картинку системной шторке файлом. Только так она попадает в
   * истории: шторка предложит Instagram, WhatsApp и Telegram, и каждый из них
   * спросит, куда именно — в историю, в статус или в переписку.
   */
  async function shareFile() {
    if (!file) return;
    setFileError(null);
    if (!navigator.share) {
      setFileError(
        "Этот браузер не умеет отдавать картинку в приложения — сохраните её и выложите вручную.",
      );
      return;
    }
    try {
      // Готовая картинка — шторку зовём сразу, пока нажатие ещё «свежее».
      let ready = prepared?.file;
      if (!ready) {
        const response = await fetch(file);
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        ready = new File([blob], shareFileName(file, blob.type), {
          type: blob.type,
        });
      }
      const payload = { files: [ready] };
      if (navigator.canShare && !navigator.canShare(payload)) {
        setFileError(
          "Это устройство не умеет отдавать картинку в приложения — сохраните её и выложите вручную.",
        );
        return;
      }
      await navigator.share(payload);
    } catch (cause) {
      // Человек закрыл шторку — не ошибка, её имя AbortError.
      if (cause instanceof Error && cause.name === "AbortError") return;
      // Браузер забыл нажатие, пока картинка догружалась: второе нажатие
      // сработает — картинка уже готова.
      if (cause instanceof Error && cause.name === "NotAllowedError") {
        setFileError("Картинка готова — нажмите «Отправить в приложение» ещё раз.");
        return;
      }
      setFileError("Не получилось передать картинку. Сохраните её кнопкой рядом.");
    }
  }

  /**
   * Отклик на «Сохранить картинку» (VED-156): ссылка скачивания молчала, и
   * было непонятно, нажалось ли. Самого конца загрузки браузер странице не
   * сообщает — говорим, что сохраняем и где искать.
   */
  function markSaved() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 5000);
  }

  /**
   * Мессенджер открываем приложением, а не сайтом.
   *
   * В установленном портале ссылка на t.me открывала белое окно: показать
   * новую вкладку окну без вкладок негде, а сайт Telegram умеет только
   * попросить открыть приложение. Во вкладке браузера ничего не меняем: там
   * ссылка работает и её можно скопировать длинным нажатием.
   */
  function openMessenger(
    event: React.MouseEvent<HTMLAnchorElement>,
    target: MessengerId,
  ) {
    // Текст без ссылки: в схеме приложения адрес идёт отдельным полем — так
    // же, как в адресе сайта выше, иначе ссылка уедет в сообщение дважды.
    const app = messengerAppLink(target, link, shareText({ text, source: messageSource }));
    const mode = detectDisplayMode(
      (query) => window.matchMedia(query),
      (window.navigator as { standalone?: boolean }).standalone,
    );
    if (!app || !opensInApp(mode, app)) return;
    event.preventDefault();
    const site = event.currentTarget.href;
    window.location.assign(app);
    // Приложения нет — окно осталось на экране, и человек должен увидеть
    // хоть что-то, а не ошибку неизвестной схемы.
    window.setTimeout(() => {
      if (shouldFallBackToSite(document.hidden)) window.location.assign(site);
    }, 1200);
  }

  return (
    <div className="space-y-6">
      <section className="glass overflow-hidden rounded-2xl border border-glass-brd">
        {previewUrl && (
          /* Ссылка на хранилище подписана и может истечь — next/image не
             годится для произвольно меняющегося домена подписи. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={previewUrl} alt="" className="max-h-64 w-full object-cover" />
        )}
        <div className="space-y-1 p-4">
          <p className="whitespace-pre-line text-sm text-text-0">{text}</p>
          {source && <p className="text-xs text-text-2">{source}</p>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-base font-bold text-text-0">
          В истории и статусы
        </h2>
        <p className="text-sm text-text-1">
          Истории ссылку не принимают — им нужен файл. Сохраните картинку или
          отдайте её сразу в приложение.
        </p>
        {file ? (
          <div className="flex flex-wrap gap-2">
            <a
              href={prepared?.url ?? file}
              download={prepared?.file.name ?? shareFileName(file, "image/jpeg")}
              onClick={markSaved}
              className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold"
            >
              {saved ? "✓ Картинка сохранена" : "Сохранить картинку"}
            </a>
            <button
              type="button"
              onClick={() => void shareFile()}
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
            >
              Отправить в приложение
            </button>
          </div>
        ) : (
          <p className="text-sm text-text-2">У этой карточки нет картинки.</p>
        )}
        {/* Статус, а не всплывашка: скринридер прочитает, и глазу видно. */}
        <p role="status" aria-live="polite" className="text-sm text-text-1">
          {saved
            ? "Картинка сохраняется в «Загрузки» — оттуда её можно выложить в историю или статус."
            : ""}
        </p>
        {fileError && (
          <p role="alert" className="text-sm text-magenta">
            {fileError}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-base font-bold text-text-0">
          В переписку
        </h2>
        <p className="text-sm text-text-1">
          Уходит ссылка: получатель увидит картинку в превью и откроет карточку
          целиком.
        </p>
        <div className="flex flex-wrap gap-2">
          {chatHref && (
            <Link
              href={chatHref}
              className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Своим в портале
            </Link>
          )}
          {MESSENGERS.map((target) => (
            <a
              key={target}
              href={messengerLink(target, link, shareText({ text, source: messageSource }))}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => openMessenger(event, target)}
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
            >
              {MESSENGER_LABELS[target]}
            </a>
          ))}
          <button
            type="button"
            onClick={() => void copy("link")}
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
          >
            {copied === "link" ? "Ссылка скопирована" : "Скопировать ссылку"}
          </button>
          <button
            type="button"
            onClick={() => void copy("text")}
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
          >
            {copied === "text" ? "Текст скопирован" : "Скопировать текст"}
          </button>
        </div>
      </section>

      {/* Instagram и YouTube кнопками не делаем намеренно: у первого адреса
          «поделиться» не существует, второй не адресат — туда публикуют. Оба
          закрываются файлом выше, и лучше сказать это словами, чем поставить
          кнопку, которая никуда не ведёт. */}
      <p className="text-xs text-text-2">
        Для Instagram и YouTube кнопок нет: туда нельзя отправить ссылкой.
        Сохраните картинку и выложите её из приложения — или отдайте её сразу
        через «Отправить в приложение».
      </p>
    </div>
  );
}
