import { describe, expect, it } from "vitest";
import {
  conferenceActionNote,
  conferenceCallCta,
  conferenceLeftLine,
  conferencePanelView,
} from "./conference-panel";

/**
 * Панель конференции в комнате. Состояний шесть — три состояния двери на
 * двух ролях, — и вживую до половины из них не дойти: ссылка истекает
 * через полсуток, а отзыв необратим без второй кнопки. Отсюда таблица.
 *
 * Даты строятся арифметикой от `new Date()`: жёсткий UTC в ожиданиях
 * падает в половине часовых поясов.
 */
const NOW = new Date();
const inMinutes = (n: number) =>
  new Date(NOW.getTime() + n * 60_000).toISOString();

const room = (over: Partial<Parameters<typeof conferencePanelView>[0]> = {}) => ({
  state: "active" as const,
  canManage: true,
  expiresAt: inMinutes(300),
  ...over,
});

describe("conferencePanelView — вход открыт", () => {
  it("хозяину даёт ссылку, «закрыть вход» и «новую ссылку»", () => {
    const view = conferencePanelView(room(), NOW);
    expect(view).toMatchObject({
      title: "Вход по ссылке открыт",
      tone: "open",
      showLink: true,
      showRevoke: true,
      showRotate: true,
    });
    expect(view.hint).toBe("Ссылка работает ещё 5 часов");
  });

  it("обычному участнику — ссылку, но без распоряжения ею", () => {
    const view = conferencePanelView(room({ canManage: false }), NOW);
    expect(view.showLink).toBe(true);
    expect(view.showRevoke).toBe(false);
    expect(view.showRotate).toBe(false);
  });
});

describe("conferencePanelView — вход закрыт", () => {
  it("отозванная называет решение, а не срок", () => {
    const view = conferencePanelView(room({ state: "revoked" }), NOW);
    expect(view.title).toBe("Вход закрыт");
    expect(view.tone).toBe("closed");
    expect(view.hint).toContain("Те, кто уже здесь, остались");
    expect(view.rotateLabel).toBe("Открыть вход заново");
  });

  it("отзыв сильнее срока: отозванная и просроченная — про отзыв", () => {
    const view = conferencePanelView(
      room({ state: "revoked", expiresAt: inMinutes(-10) }),
      NOW,
    );
    expect(view.title).toBe("Вход закрыт");
  });

  it("просроченная зовёт выдать новую", () => {
    const view = conferencePanelView(
      room({ state: "expired", expiresAt: inMinutes(-10) }),
      NOW,
    );
    expect(view.title).toBe("Срок ссылки истёк");
    expect(view.rotateLabel).toBe("Выдать новую ссылку");
  });

  it("нерабочую ссылку не показывает и копировать не предлагает", () => {
    for (const state of ["revoked", "expired"] as const) {
      const view = conferencePanelView(room({ state }), NOW);
      expect(view.showLink).toBe(false);
      expect(view.showRevoke).toBe(false);
    }
  });

  it("участнику при закрытом входе не показывает ни одной кнопки", () => {
    for (const state of ["revoked", "expired"] as const) {
      const view = conferencePanelView(room({ state, canManage: false }), NOW);
      expect(view.showRotate).toBe(false);
      expect(view.showRevoke).toBe(false);
      expect(view.hint).toContain("Вы остаётесь в комнате");
    }
  });
});

describe("conferenceLeftLine", () => {
  it("часы, минуты и последняя минута", () => {
    expect(conferenceLeftLine(inMinutes(720), NOW)).toBe(
      "Ссылка работает ещё 12 часов",
    );
    expect(conferenceLeftLine(inMinutes(61), NOW)).toBe(
      "Ссылка работает ещё 1 час",
    );
    expect(conferenceLeftLine(inMinutes(125), NOW)).toBe(
      "Ссылка работает ещё 2 часа",
    );
    expect(conferenceLeftLine(inMinutes(41), NOW)).toBe(
      "Ссылка работает ещё 41 минуту",
    );
    expect(conferenceLeftLine(inMinutes(2), NOW)).toBe(
      "Ссылка работает ещё 2 минуты",
    );
  });

  it("меньше минуты не превращается в «0 минут»", () => {
    expect(conferenceLeftLine(new Date(NOW.getTime() + 20_000).toISOString(), NOW)).toBe(
      "Ссылка работает меньше минуты",
    );
  });

  it("истёкшая и кривая дата не притворяются работающими", () => {
    expect(conferenceLeftLine(inMinutes(-1), NOW)).toBe("Срок ссылки истёк");
    expect(conferenceLeftLine(NOW.toISOString(), NOW)).toBe(
      "Срок ссылки истёк",
    );
    expect(conferenceLeftLine("не дата", NOW)).toBe("");
  });

  it("склонения на круглых числах", () => {
    expect(conferenceLeftLine(inMinutes(11 * 60), NOW)).toContain("11 часов");
    expect(conferenceLeftLine(inMinutes(21 * 60), NOW)).toContain("21 час");
    expect(conferenceLeftLine(inMinutes(11), NOW)).toContain("11 минут");
    expect(conferenceLeftLine(inMinutes(21), NOW)).toContain("21 минуту");
  });
});

describe("conferenceCallCta", () => {
  it("идущий разговор зовут «войти», не начатый — «начать»", () => {
    expect(
      conferenceCallCta({ callLive: true, seatsTaken: 2, maxParticipants: 4 }),
    ).toBe("Войти в разговор");
    expect(
      conferenceCallCta({ callLive: false, seatsTaken: 1, maxParticipants: 4 }),
    ).toBe("Начать разговор");
  });
});

describe("conferenceActionNote", () => {
  it("говорит, что случилось, а не «успешно»", () => {
    expect(conferenceActionNote("copied")).toBe("Ссылка скопирована");
    expect(conferenceActionNote("revoked")).toContain("больше не войдут");
    expect(conferenceActionNote("rotated")).toContain("старая больше не работает");
    for (const action of ["copied", "revoked", "rotated"] as const)
      expect(conferenceActionNote(action)).not.toMatch(/успешно|ошибка|ok/i);
  });
});
