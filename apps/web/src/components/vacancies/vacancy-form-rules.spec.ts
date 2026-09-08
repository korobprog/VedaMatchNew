import { describe, expect, it } from "vitest";
import {
  EMPTY_VACANCY_FORM,
  parseMoney,
  toCreateRequest,
  validateVacancyForm,
  type VacancyFormState,
} from "./vacancy-form-rules";

const now = new Date("2026-09-08T12:00:00Z");
const location = { city: "Москва", lat: 55.75, lon: 37.62 };

const work: VacancyFormState = {
  ...EMPTY_VACANCY_FORM,
  title: "Повар",
  location,
  payMin: "60 000",
};

describe("validateVacancyForm", () => {
  it("работа: город обязателен, кроме удалёнки", () => {
    expect(validateVacancyForm(work, now)).toBeNull();
    expect(validateVacancyForm({ ...work, location: null }, now)).toMatch(
      /город/i,
    );
    expect(
      validateVacancyForm(
        { ...work, location: null, workFormat: "remote" },
        now,
      ),
    ).toBeNull();
  });

  it("работа: оплата или «по договорённости»", () => {
    expect(validateVacancyForm({ ...work, payMin: "" }, now)).toMatch(/оплат/i);
    expect(
      validateVacancyForm({ ...work, payMin: "", payNegotiable: true }, now),
    ).toBeNull();
    expect(
      validateVacancyForm({ ...work, payMin: "100", payMax: "50" }, now),
    ).toMatch(/больше верхней/);
    expect(validateVacancyForm({ ...work, payMin: "много" }, now)).toMatch(
      /целое число/,
    );
  });

  it("служение только от общины и с будущей датой", () => {
    const seva: VacancyFormState = {
      ...EMPTY_VACANCY_FORM,
      kind: "seva",
      title: "Кухня",
    };
    expect(validateVacancyForm(seva, now)).toMatch(/от имени общины/);
    expect(
      validateVacancyForm({ ...seva, communityId: "c1" }, now),
    ).toBeNull();
    expect(
      validateVacancyForm(
        { ...seva, communityId: "c1", sevaTerm: "until" },
        now,
      ),
    ).toMatch(/до какой даты/);
    expect(
      validateVacancyForm(
        {
          ...seva,
          communityId: "c1",
          sevaTerm: "until",
          sevaUntil: "2026-01-01T10:00",
        },
        now,
      ),
    ).toMatch(/уже прошла/);
  });

  it("задача: дедлайн необязателен, но не в прошлом", () => {
    const task: VacancyFormState = {
      ...EMPTY_VACANCY_FORM,
      kind: "task",
      title: "Перевезти книги",
    };
    expect(validateVacancyForm(task, now)).toBeNull();
    expect(
      validateVacancyForm({ ...task, dueAt: "2026-09-01T10:00" }, now),
    ).toMatch(/уже прошёл/);
  });
});

describe("toCreateRequest", () => {
  it("у работы уходит оплата, у служения — льготы, чужие поля не уходят", () => {
    const req = toCreateRequest(work);
    expect(req.pay).toEqual({
      min: 60000,
      max: null,
      period: "month",
      currency: "RUB",
      negotiable: false,
    });
    expect(req).not.toHaveProperty("perks");
    expect(req).not.toHaveProperty("dueAt");

    const seva = toCreateRequest({
      ...EMPTY_VACANCY_FORM,
      kind: "seva",
      title: "Кухня",
      communityId: "c1",
      perks: ["prasad"],
      isRemote: true,
    });
    expect(seva.perks).toEqual(["prasad"]);
    expect(seva.isRemote).toBe(true);
    expect(seva).not.toHaveProperty("pay");
  });
});

describe("parseMoney", () => {
  it("пробелы внутри числа не мешают, буквы — ошибка", () => {
    expect(parseMoney("60 000")).toBe(60000);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("60k")).toBe("invalid");
  });
});
