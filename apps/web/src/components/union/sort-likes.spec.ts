import { describe, expect, it } from "vitest";
import type { UnionConnectionRequestDto } from "@vedamatch/shared";
import { sortIncomingLikes } from "./sort-likes";

function like(
  id: string,
  options: { superlike?: boolean; at?: string } = {},
): UnionConnectionRequestDto {
  return {
    id: `req-${id}`,
    user: { id, name: id },
    isSuperlike: options.superlike ?? false,
    createdAt: options.at ?? "2026-08-01T00:00:00.000Z",
  } as unknown as UnionConnectionRequestDto;
}

const ids = (list: UnionConnectionRequestDto[]) => list.map((l) => l.user.id);

describe("sortIncomingLikes", () => {
  // Ради этого звёздочка и заведена: отмеченные должны оказаться сверху,
  // иначе разбирать кучу заявок она не помогает.
  it("puts favourites first, ahead of everything else", () => {
    const sorted = sortIncomingLikes(
      [like("a"), like("b"), like("c")],
      new Set(["c"]),
    );

    expect(ids(sorted)[0]).toBe("c");
  });

  it("beats a superlike: my own mark outranks someone else's spent quota", () => {
    const sorted = sortIncomingLikes(
      [like("super", { superlike: true }), like("fav")],
      new Set(["fav"]),
    );

    expect(ids(sorted)).toEqual(["fav", "super"]);
  });

  it("keeps superlikes ahead of plain likes when neither is a favourite", () => {
    const sorted = sortIncomingLikes(
      [like("plain"), like("super", { superlike: true })],
      new Set(),
    );

    expect(ids(sorted)).toEqual(["super", "plain"]);
  });

  it("shows fresher first inside a group", () => {
    const sorted = sortIncomingLikes(
      [
        like("old", { at: "2026-08-01T00:00:00.000Z" }),
        like("new", { at: "2026-08-20T00:00:00.000Z" }),
      ],
      new Set(),
    );

    expect(ids(sorted)).toEqual(["new", "old"]);
  });

  // Риск: отсортировать входной массив на месте. Он приходит из пропсов
  // React, и мутация чужих данных однажды выстрелит лишним рендером.
  it("does not mutate the input", () => {
    const input = [like("a"), like("b")];
    const copy = [...input];

    sortIncomingLikes(input, new Set(["b"]));

    expect(input).toEqual(copy);
  });
});
