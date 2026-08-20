import { beforeEach, describe, expect, it } from "vitest";
import {
  parseSeen,
  readSeenNews,
  rememberSeenNews,
  serverSeenNews,
  withSeen,
} from "./portal-news-seen";

beforeEach(() => localStorage.clear());

describe("parseSeen", () => {
  it("читает список отметок", () => {
    expect(parseSeen('["a","b"]')).toEqual(["a", "b"]);
  });

  it("не роняет главную на чужом или битом значении", () => {
    // В localStorage мог написать кто угодно — включая прошлую версию нас.
    expect(parseSeen(null)).toEqual([]);
    expect(parseSeen("не json")).toEqual([]);
    expect(parseSeen('{"a":1}')).toEqual([]);
    expect(parseSeen('["a",42,null]')).toEqual(["a"]);
  });
});

describe("withSeen", () => {
  it("ставит свежую отметку первой и не двоит", () => {
    expect(withSeen(["a", "b"], "b")).toEqual(["b", "a"]);
  });

  it("держит не больше двадцати: старые новости и так уходят с главной", () => {
    const many = Array.from({ length: 25 }, (_, index) => `n${index}`);
    const next = withSeen(many, "new");
    expect(next).toHaveLength(20);
    expect(next[0]).toBe("new");
  });
});

describe("readSeenNews", () => {
  it("отдаёт один и тот же объект, пока хранилище не менялось", () => {
    // useSyncExternalStore сравнивает снимок по ссылке: новый массив на каждый
    // вызов отправил бы React в бесконечную перерисовку.
    rememberSeenNews("a");
    expect(readSeenNews()).toBe(readSeenNews());
  });

  it("видит изменение после новой отметки", () => {
    rememberSeenNews("a");
    expect(readSeenNews()).toEqual(["a"]);
    rememberSeenNews("b");
    expect(readSeenNews()).toEqual(["b", "a"]);
  });

  it("на сервере считает, что закрытых новостей нет", () => {
    expect(serverSeenNews()).toEqual([]);
  });
});
