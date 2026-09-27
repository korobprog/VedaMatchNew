import { describe, expect, it } from "vitest";
import { MAX_AVATAR_SIZE, avatarFileError } from "./avatar-file";

describe("avatarFileError", () => {
  it("пропускает jpg, png и webp до 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"])
      expect(avatarFileError({ type, size: 1000 })).toBeNull();
    expect(
      avatarFileError({ type: "image/png", size: MAX_AVATAR_SIZE }),
    ).toBeNull();
  });

  it("не пропускает другой вид файла", () => {
    expect(avatarFileError({ type: "image/gif", size: 10 })).toBe(
      "Разрешены только jpg, jpeg, png и webp",
    );
  });

  it("не пропускает файл больше 5 MB", () => {
    expect(
      avatarFileError({ type: "image/jpeg", size: MAX_AVATAR_SIZE + 1 }),
    ).toBe("Размер аватара не должен превышать 5 MB");
  });
});
