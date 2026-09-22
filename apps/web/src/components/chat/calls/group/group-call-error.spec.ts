import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http-client";
import { describeGroupCallError } from "./group-call-error";

/** Обычная вкладка: https, микрофон браузером в принципе разрешён. */
const secure = { secure: true, hasMediaDevices: true };

/** Отказ браузера приходит именованной ошибкой — воспроизводим её форму. */
function mediaError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

describe("почему не пустили в звонок", () => {
  it("отказ сервера показывается его же словами", () => {
    // Пятый участник: потолок держит сервер, и формулировка приходит от
    // него — переписывать её здесь значит начать врать при первом же
    // изменении правила.
    expect(
      describeGroupCallError(
        new ApiError("В звонке уже 4 человека — больше пока нельзя", 409),
      ),
    ).toEqual({
      kind: "server",
      message: "В звонке уже 4 человека — больше пока нельзя",
    });
  });

  it("закрытая комната и выключенные звонки — тоже отказ сервера", () => {
    expect(
      describeGroupCallError(new ApiError("Этот звонок уже закончился", 409))
        .message,
    ).toBe("Этот звонок уже закончился");
    expect(
      describeGroupCallError(new ApiError("Звонки временно выключены", 503))
        .kind,
    ).toBe("server");
  });

  it("человек не дал микрофон — подсказываем, где его вернуть", () => {
    const described = describeGroupCallError(mediaError("NotAllowedError"), secure);
    expect(described.kind).toBe("permission");
    expect(described.message).toContain("настройках браузера");
  });

  it("SecurityError — тоже отказ в доступе, а не поломка", () => {
    expect(describeGroupCallError(mediaError("SecurityError"), secure).kind).toBe(
      "permission",
    );
  });

  it("портал по http объясняет причину, а не отправляет искать разрешения", () => {
    // Здесь браузер не отдаёт `navigator.mediaDevices` вовсе, и захват
    // падает безымянным TypeError — по имени эту беду не опознать.
    const described = describeGroupCallError(
      new TypeError("Cannot read properties of undefined"),
      { secure: false, hasMediaDevices: false },
    );
    expect(described.kind).toBe("device");
    expect(described.message).toContain("https");
  });

  it("отказ сервера остаётся отказом сервера и по http", () => {
    expect(
      describeGroupCallError(new ApiError("В звонке уже 4 человека", 409), {
        secure: false,
        hasMediaDevices: false,
      }).kind,
    ).toBe("server");
  });

  it("микрофона нет или он занят — это про устройство, не про разрешения", () => {
    expect(describeGroupCallError(mediaError("NotFoundError"), secure)).toEqual({
      kind: "device",
      message: "Микрофон не найден",
    });
    expect(describeGroupCallError(mediaError("NotReadableError"), secure).kind).toBe(
      "device",
    );
  });

  it("незнакомая ошибка сохраняет своё сообщение", () => {
    expect(describeGroupCallError(new Error("что-то пошло не так"), secure)).toEqual({
      kind: "unknown",
      message: "что-то пошло не так",
    });
  });

  it("совсем непонятное всё равно объясняется человеку", () => {
    expect(describeGroupCallError(null, secure)).toEqual({
      kind: "unknown",
      message: "Не удалось войти в звонок",
    });
  });
});
