"use client";

import { useState } from "react";
import Link from "next/link";
import { detectDisplayMode } from "@/lib/pwa/browser";
import {
  MESSENGER_LABELS,
  isOwnFile,
  messengerAppLink,
  messengerLink,
  opensInApp,
  shareText,
  shouldFallBackToSite,
  type MessengerId,
} from "./share-targets";

const MESSENGERS: MessengerId[] = ["telegram", "whatsapp", "vk"];

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
  link,
  previewUrl,
  filePath,
  chatHref,
}: {
  text: string;
  source: string | null;
  link: string;
  previewUrl: string | null;
  /** Путь к файлу на нашем домене; null — картинки у карточки нет. */
  filePath: string | null;
  chatHref: string | null;
}) {
  const [copied, setCopied] = useState<"text" | "link" | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const message = shareText({ text, source, link });
  const file = isOwnFile(filePath) ? filePath : null;

  async function copy(what: "text" | "link") {
    try {
      await navigator.clipboard.writeText(what === "text" ? message : link);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Буфер закрыт настройками браузера — текст остаётся на экране, его
      // можно выделить руками.
    }
  }

  /**
   * Отдать картинку системной шторке файлом. Только так она попадает в
   * истории: шторка предложит Instagram, WhatsApp и Telegram, и каждый из них
   * спросит, куда именно — в историю, в статус или в переписку.
   */
  async function shareFile() {
    if (!file) return;
    setFileError(null);
    try {
      const response = await fetch(file);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const name = file.split("/").pop() || "vedamatch";
      const payload = {
        files: [new File([blob], `${name}.jpg`, { type: blob.type })],
      };
      if (!navigator.canShare?.(payload)) {
        setFileError("Это устройство не умеет отдавать картинку в приложения — сохраните её и выложите вручную.");
        return;
      }
      await navigator.share(payload);
    } catch (cause) {
      // Человек закрыл шторку — не ошибка, её имя AbortError.
      if (cause instanceof Error && cause.name === "AbortError") return;
      setFileError("Не получилось передать картинку. Сохраните её кнопкой рядом.");
    }
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
    const app = messengerAppLink(target, link, shareText({ text, source }));
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
              href={file}
              download
              className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Сохранить картинку
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
              href={messengerLink(target, link, shareText({ text, source }))}
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
