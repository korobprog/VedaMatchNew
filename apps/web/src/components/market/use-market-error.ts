"use client";

/**
 * Ответ API Рынка на ошибку — snake_case-код в поле `message`, а не готовая
 * фраза: перевод живёт в неймспейсе `Market.errors`. Здесь код достаётся из
 * тела ответа, а неизвестный превращается в `unknown`, чтобы пользователь
 * увидел человеческий текст, а не сырой идентификатор.
 */
export async function marketErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    const code = Array.isArray(body.message) ? body.message[0] : body.message;
    if (typeof code === "string" && /^[a-z0-9_]+$/.test(code)) return code;
  } catch {
    // Тело не JSON — например, прокси вернул HTML-страницу ошибки.
  }
  return "unknown";
}

/** Перевод кода ошибки с откатом на общий текст. */
export function marketErrorText(
  t: (key: string) => string,
  code: string | null,
): string | null {
  if (!code) return null;
  const translated = t(`errors.${code}`);
  // next-intl возвращает сам ключ, когда перевода нет.
  return translated.startsWith("errors.") ? t("errors.unknown") : translated;
}
