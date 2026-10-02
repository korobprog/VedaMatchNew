import { describe, expect, it } from "vitest";
import { PREVIEW_VERSION } from "@/lib/radio-share-meta";
import { trackSharePath, trackShareText } from "./share-track";

describe("trackSharePath", () => {
  it("адрес записи несёт версию превью — мессенджер кэширует карточку по адресу страницы", () => {
    // Превью в WhatsApp/МАХ держится по адресу ссылки сутки. Пока адрес не
    // менялся, ни одна правка карточки не была видна в чате: отправляли одну
    // и ту же ссылку и каждый раз смотрели вчерашний кэш. Версия в адресе
    // делает следующую отправку свежей — краулер обязан прийти заново.
    expect(trackSharePath("t 1")).toBe(
      `/radio?track=t%201&v=${PREVIEW_VERSION}`,
    );
  });

  it("версия та же, что у кадра: правка превью обновляет и текст, и картинку", () => {
    // Одна кнопка на оба кэша: страницу мессенджер запоминает по адресу
    // страницы, картинку — по адресу картинки.
    expect(trackSharePath("t1")).toContain(`v=${PREVIEW_VERSION}`);
  });
});

describe("trackShareText", () => {
  it("подпись — название с исполнителем без разрывов", () => {
    expect(trackShareText({ id: "t1", title: "Damodarastaka", artist: { name: "Havi das" } })).toBe(
      "Damodarastaka — Havi das",
    );
  });
});
