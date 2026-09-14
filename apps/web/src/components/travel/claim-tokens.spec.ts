import { describe, expect, it } from "vitest";
import {
  MAX_CLAIM_TOKENS,
  parseClaimTokens,
  withClaimToken,
  withoutClaimTokens,
} from "./claim-tokens";

const token = (n: number) => `${String(n).padStart(4, "0")}${"a".repeat(28)}`;

describe("parseClaimTokens", () => {
  it("пусто, мусор и не список — пустой список", () => {
    expect(parseClaimTokens(null)).toEqual([]);
    expect(parseClaimTokens("{")).toEqual([]);
    expect(parseClaimTokens('{"a":1}')).toEqual([]);
  });

  it("отбрасывает чужой формат и повторы", () => {
    expect(
      parseClaimTokens(JSON.stringify([token(1), "short", token(1), 5])),
    ).toEqual([token(1)]);
  });
});

describe("withClaimToken", () => {
  it("добавляет в конец без повторов", () => {
    expect(withClaimToken([token(1), token(2)], token(1))).toEqual([
      token(2),
      token(1),
    ]);
  });

  it("не принимает кривой токен", () => {
    expect(withClaimToken([token(1)], "bad")).toEqual([token(1)]);
  });

  it("вытесняет самые старые сверх предела", () => {
    let list: string[] = [];
    for (let i = 0; i < MAX_CLAIM_TOKENS + 3; i += 1) {
      list = withClaimToken(list, token(i));
    }
    expect(list).toHaveLength(MAX_CLAIM_TOKENS);
    expect(list[0]).toBe(token(3));
  });
});

describe("withoutClaimTokens", () => {
  it("убирает привязанные", () => {
    expect(
      withoutClaimTokens([token(1), token(2), token(3)], [token(2)]),
    ).toEqual([token(1), token(3)]);
  });
});
