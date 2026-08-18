import { beforeEach, describe, expect, it } from "vitest";
import {
  effectiveMode,
  layoutKey,
  markServiceOpened,
  parseLayout,
  readLayout,
  serverLayout,
  writeLayout,
} from "./service-layout";

const USER = "u1";

beforeEach(() => {
  localStorage.clear();
  // Снимок кэшируется по ссылке на сырую строку; чистого хранилища
  // достаточно, чтобы кэш промахнулся и перечитал.
});

describe("parseLayout", () => {
  it("пустое хранилище — это умолчания, а не поломка", () => {
    expect(parseLayout(null)).toEqual({
      order: [],
      pinnedId: null,
      mode: null,
    });
  });

  /**
   * Испорченную строку в localStorage починить нельзя, а уронить из-за неё
   * главную — можно. Поэтому мусор трактуется как «ничего не сохранено».
   */
  it("мусор не роняет разбор", () => {
    for (const raw of ["{", "null", "[]", '"строка"', "12"]) {
      expect(parseLayout(raw), raw).toEqual({
        order: [],
        pinnedId: null,
        mode: null,
      });
    }
  });

  it("выбрасывает из порядка всё, что не строка", () => {
    expect(parseLayout('{"order":["a",1,null,"b"]}').order).toEqual(["a", "b"]);
  });

  it("незнакомый режим считает невыбранным", () => {
    expect(parseLayout('{"mode":"канбан"}').mode).toBeNull();
    expect(parseLayout('{"mode":"compact"}').mode).toBe("compact");
  });
});

describe("effectiveMode", () => {
  /**
   * Главное правило режима по умолчанию: человек, который ещё ни разу не
   * открывал сервис, видит подробные карточки с описаниями. По одному слову
   * в плитке не понять, чем «Сообщества» отличаются от «Контактов».
   */
  it("до первого открытия сервиса показывает подробный", () => {
    expect(effectiveMode(serverLayout())).toBe("detailed");
  });

  it("выбранный режим уважается", () => {
    expect(
      effectiveMode({ order: [], pinnedId: null, mode: "compact" }),
    ).toBe("compact");
  });
});

describe("writeLayout", () => {
  /**
   * Ради этого модуль и появился: сетка сохраняет порядок, переключатель —
   * режим, и оба пишут в один ключ. Полная перезапись объекта стирала бы
   * чужое поле.
   */
  it("не затирает поля, которых не касается", () => {
    writeLayout(USER, { mode: "compact" });
    writeLayout(USER, { order: ["a", "b"], pinnedId: "a" });

    expect(readLayout(USER)).toEqual({
      order: ["a", "b"],
      pinnedId: "a",
      mode: "compact",
    });
  });

  it("пишет под ключ пользователя", () => {
    writeLayout(USER, { mode: "compact" });
    expect(localStorage.getItem(layoutKey(USER))).toContain("compact");
    expect(readLayout("другой")).toEqual(serverLayout());
  });
});

describe("markServiceOpened", () => {
  it("первое открытие сервиса переводит главную в компактный режим", () => {
    expect(effectiveMode(readLayout(USER))).toBe("detailed");
    markServiceOpened(USER);
    expect(effectiveMode(readLayout(USER))).toBe("compact");
  });

  /**
   * Человек, который сам вернулся к подробному виду, открывает сервисы так
   * же часто — и каждый раз его выбор откатывался бы обратно.
   */
  it("не отменяет явно выбранный подробный режим", () => {
    writeLayout(USER, { mode: "detailed" });
    markServiceOpened(USER);
    expect(readLayout(USER).mode).toBe("detailed");
  });
});
