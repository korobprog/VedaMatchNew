import { describe, expect, it } from "vitest";
import type { ChatConferenceInviteDto } from "@vedamatch/shared";
import {
  conferenceCallLine,
  conferenceExpiryLine,
  conferenceJoinStep,
  conferenceLinkPath,
  conferenceLoginHref,
  conferenceSeatsLine,
} from "./conference-join-step";

const TOKEN = "a".repeat(32);

function invite(patch: Partial<ChatConferenceInviteDto> = {}): ChatConferenceInviteDto {
  return {
    title: "Конференция · Мадхава",
    host: { id: "u1", name: "Мадхава", avatarUrl: null, lastSeenAt: null },
    state: "active",
    expiresAt: "2026-09-22T23:00:00.000Z",
    seatsTaken: 1,
    maxParticipants: 4,
    callLive: false,
    alreadyMember: false,
    denial: null,
    ...patch,
  };
}

describe("адрес возврата", () => {
  it("страница приглашения и есть адрес возврата", () => {
    expect(conferenceLinkPath(TOKEN)).toBe(`/j/${TOKEN}`);
  });

  // Ключевой тест всей задачи: после входа — и после ПЕРВОГО входа, то есть
  // регистрации, — человек обязан вернуться ровно на страницу ссылки, а не
  // на лендинг. Путь едет в `?returnTo=` тем же способом, что у всего
  // портала; открытый редирект отсекает getSafeReturnTo.
  it("вход уносит с адресом возврата на саму ссылку", () => {
    expect(conferenceLoginHref(TOKEN)).toBe(
      `/login?returnTo=${encodeURIComponent(`/j/${TOKEN}`)}`,
    );
  });

  it("адрес возврата закодирован — ссылка не рассыпается по слэшам", () => {
    const href = conferenceLoginHref(TOKEN);
    expect(href.split("returnTo=")[1]).not.toContain("/");
  });
});

describe("шаг экрана приглашения", () => {
  it("пока карточка не пришла — ждём", () => {
    expect(
      conferenceJoinStep({ token: TOKEN, signedIn: false, invite: null }),
    ).toEqual({ kind: "loading" });
  });

  it("вошедшего ведём в комнату без единого экрана", () => {
    const step = conferenceJoinStep({
      token: TOKEN,
      signedIn: true,
      invite: invite(),
    });
    expect(step.kind).toBe("enter");
  });

  it("своему говорит «возвращаем», а не «входим»", () => {
    const step = conferenceJoinStep({
      token: TOKEN,
      signedIn: true,
      invite: invite({ alreadyMember: true }),
    });
    expect(step).toEqual({ kind: "enter", note: "Возвращаем вас в конференцию…" });
  });

  it("гостя ведём на вход и обратно сюда же", () => {
    const step = conferenceJoinStep({
      token: TOKEN,
      signedIn: false,
      invite: invite(),
    });
    expect(step).toEqual({
      kind: "sign-in",
      href: conferenceLoginHref(TOKEN),
      action: "Войти и присоединиться",
    });
  });

  // Гость, которому всё равно не войти, не должен заводить аккаунт ради
  // закрытой двери: отказ показывается раньше приглашения войти.
  it.each([
    ["срок истёк", "Срок ссылки истёк. Попросите новую у того, кто вас позвал."],
    ["мест нет", "В конференции уже 4 человека — это предел."],
  ])("гостю с отказом (%s) вход не предлагается", (_name, denial) => {
    const step = conferenceJoinStep({
      token: TOKEN,
      signedIn: false,
      invite: invite({ denial }),
    });
    expect(step).toEqual({
      kind: "denied",
      title: "Войти не получится",
      text: denial,
    });
  });

  it("отказ вошедшему показывается тем же текстом, что пришёл с сервера", () => {
    const step = conferenceJoinStep({
      token: TOKEN,
      signedIn: true,
      invite: invite({ denial: "Вход по этой ссылке закрыли." }),
    });
    expect(step).toEqual({
      kind: "denied",
      title: "Войти не получится",
      text: "Вход по этой ссылке закрыли.",
    });
  });

  it("несуществующая ссылка — своя причина, а не вечное ожидание", () => {
    expect(
      conferenceJoinStep({
        token: TOKEN,
        signedIn: true,
        invite: null,
        error: "Такой конференции нет",
      }),
    ).toEqual({
      kind: "denied",
      title: "Конференция не открылась",
      text: "Такой конференции нет",
    });
  });

  it("ошибка сильнее карточки: пришедший отказ не затирает сбой", () => {
    const step = conferenceJoinStep({
      token: TOKEN,
      signedIn: true,
      invite: invite(),
      error: "Не удалось связаться с порталом",
    });
    expect(step).toMatchObject({ kind: "denied" });
  });
});

describe("подписи на карточке", () => {
  it.each([
    [0, "Занято 0 из 4 — свободно ещё 4 места"],
    [1, "Занято 1 из 4 — свободно ещё 3 места"],
    [3, "Занято 3 из 4 — свободно ещё 1 место"],
    [4, "Мест нет: заняты все 4"],
  ])("места при %i занятых", (seatsTaken, expected) => {
    expect(conferenceSeatsLine(invite({ seatsTaken }))).toBe(expected);
  });

  it("про идущий разговор говорит прямо", () => {
    expect(conferenceCallLine(invite({ callLive: true }))).toBe(
      "Разговор уже идёт",
    );
    expect(conferenceCallLine(invite({ callLive: false }))).toContain(
      "начнёте вы",
    );
  });

  // Даты строятся в местном времени: экран показывает их
  // `toLocaleString`, и тест с жёстким UTC падал бы в половине часовых
  // поясов, а не ловил ошибку.
  const at = (day: number, hour: number) =>
    new Date(2026, 8, day, hour, 0, 0);

  it("срок в тот же день — только время", () => {
    const line = conferenceExpiryLine(at(22, 20).toISOString(), at(22, 12));
    expect(line).toMatch(/^Ссылка работает до \d{2}:\d{2}$/);
  });

  it("срок на следующий день — с датой", () => {
    const line = conferenceExpiryLine(at(23, 9).toISOString(), at(22, 20));
    expect(line).toContain("сентября");
    expect(line).toContain("23");
  });

  it("истёкший срок называется истёкшим", () => {
    expect(conferenceExpiryLine(at(22, 10).toISOString(), at(22, 12))).toBe(
      "Срок ссылки истёк",
    );
  });

  it("мусор вместо даты не ломает карточку", () => {
    expect(conferenceExpiryLine("не дата")).toBe("");
  });
});
