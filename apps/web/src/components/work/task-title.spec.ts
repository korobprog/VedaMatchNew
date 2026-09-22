import { describe, expect, it } from "vitest";
import {
  TITLE_SOFT_MAX,
  deriveTaskTitle,
  normalizeTaskTitle,
  taskFromDraft,
  titleToSave,
} from "./task-title";

describe("normalizeTaskTitle", () => {
  it("убирает пробелы по краям", () => {
    expect(normalizeTaskTitle("  Починить кнопку  ")).toBe("Починить кнопку");
  });

  it("схлопывает перевод строки в пробел", () => {
    expect(normalizeTaskTitle("Починить\nкнопку")).toBe("Починить кнопку");
  });

  it("схлопывает вставленный из письма текст с двойными пробелами", () => {
    expect(normalizeTaskTitle("Починить \n\n  кнопку")).toBe(
      "Починить кнопку",
    );
  });
});

describe("titleToSave", () => {
  it("без изменений сохранять нечего", () => {
    expect(titleToSave("Починить кнопку", "Починить кнопку")).toBeNull();
  });

  it("разница только в пробелах — тоже нечего", () => {
    expect(titleToSave("  Починить  кнопку ", "Починить кнопку")).toBeNull();
  });

  it("пустое название не сохраняется", () => {
    expect(titleToSave("   ", "Починить кнопку")).toBeNull();
    expect(titleToSave("\n", "Починить кнопку")).toBeNull();
  });

  it("новое название возвращается очищенным", () => {
    expect(titleToSave(" Починить\nкнопку ", "Старое")).toBe(
      "Починить кнопку",
    );
  });
});

describe("deriveTaskTitle", () => {
  it("берёт первое предложение целиком, когда оно помещается", () => {
    expect(
      deriveTaskTitle(
        "Починить ссылки в письмах. Они ведут на старый домен, надо заменить.",
      ),
    ).toBe("Починить ссылки в письмах.");
  });

  it("первая строка — готовая граница, её поставил человек", () => {
    expect(deriveTaskTitle("Ссылки в письмах\nВедут на старый домен")).toBe(
      "Ссылки в письмах",
    );
  });

  it("длинную сплошную фразу режет по слову и метит многоточием", () => {
    const title = deriveTaskTitle(
      "надо бы посмотреть почему при переходе по ссылке из письма открывается старая страница портала",
    );
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(TITLE_SOFT_MAX + 1);
    // Слово пополам не рвётся: обрыв не должен читаться как опечатка.
    expect(title.replace(/…$/, "").endsWith(" ")).toBe(false);
    expect(
      "надо бы посмотреть почему при переходе по ссылке из письма открывается старая страница портала".startsWith(
        title.replace(/…$/, ""),
      ),
    ).toBe(true);
  });
});

describe("taskFromDraft", () => {
  it("описание уходит целиком, заголовок собирается сам (VED-324)", () => {
    const text =
      "Кнопка «сохранить» в карточке не срабатывает с первого раза. Повторяется на телефоне.";
    const fields = taskFromDraft(text);
    expect(fields.title).toBe(
      "Кнопка «сохранить» в карточке не срабатывает с первого раза.",
    );
    expect(fields.description).toBe(text);
  });

  it("короткая строка не дублируется в описании", () => {
    // Иначе значок «в карточке есть текст» врёт у каждой односложной задачи.
    const fields = taskFromDraft("Обновить сертификат");
    expect(fields.title).toBe("Обновить сертификат");
    expect(fields.description).toBe("");
  });

  it("свой заголовок побеждает выведенный, а описание остаётся", () => {
    const fields = taskFromDraft("Обновить сертификат", "Сертификат Caddy");
    expect(fields.title).toBe("Сертификат Caddy");
    expect(fields.description).toBe("Обновить сертификат");
  });

  it("пустой свой заголовок означает «собери сам»", () => {
    expect(taskFromDraft("Обновить сертификат", "   ").title).toBe(
      "Обновить сертификат",
    );
  });

  it("перевод строки в своём заголовке схлопывается", () => {
    expect(taskFromDraft("Текст задачи", "Строка\nвторая").title).toBe(
      "Строка вторая",
    );
  });

  it("пустое описание не даёт ни заголовка, ни описания", () => {
    expect(taskFromDraft("   ")).toEqual({ title: "", description: "" });
  });
});
