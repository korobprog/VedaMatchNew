import { apiFetch } from "@/lib/http-client";

/**
 * Отправка картинки к уже созданной записи.
 *
 * Эндпоинт обложки требует идентификатор материала, поэтому картинка
 * уезжает вторым запросом — после того, как запись создана. Общий для обеих
 * форм публикации: расходиться им нельзя, иначе картинка, принятая мастером,
 * потеряется в форме «Профи».
 *
 * Неудача не отменяет публикацию: запись уже существует, и повторить
 * загрузку можно на её странице. Поэтому возвращаем признак, а не
 * исключение, — форме остаётся решить, говорить ли о ней.
 */
export async function uploadEntryCover(
  apiUrl: string,
  entryId: string,
  file: File,
): Promise<boolean> {
  const body = new FormData();
  body.append("file", file);
  try {
    const res = await apiFetch(`${apiUrl}/library/entries/${entryId}/preview`, {
      method: "POST",
      credentials: "include",
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}
