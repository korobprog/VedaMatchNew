/**
 * Длительность записи и подборки. Отдельным модулем и под тестом: в макетах
 * сервиса она встречается в четырёх видах, и все четыре легко перепутать.
 *
 * Две функции, а не одна с флагом, потому что это два разных языка. На
 * карточке записи время — это счётчик плеера, и `7:02` читается как позиция
 * на дорожке. В подписи подборки время — это «сколько займёт», и `58 мин`
 * отвечает на этот вопрос, а `0:58:00` заставляет считать.
 */

/**
 * Время записи, как на дорожке плеера: `3:18`, `7:02`, `1:12:40`.
 *
 * Минуты дополняются нулём только при наличии часов: `3:18`, а не `03:18` —
 * так пишут все плееры, и лишний ноль читается как «ноль часов».
 */
export function formatTrackDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Сколько займёт подборка: `58 мин`, `2 ч 10 мин`, `3 ч`.
 *
 * Секунды не показываются: в подписи «14 записей · 58 мин» они шум. Ровные
 * часы не тянут за собой `0 мин` — `3 ч` и есть три часа.
 */
export function formatTotalDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const totalMinutes = Math.round(safe / 60);

  if (totalMinutes < 60) return `${totalMinutes} мин`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`;
}

/**
 * Объём файла словами. Копия приёма из `components/chat/chat-time.ts`:
 * контракт сервисного модуля запрещает импортировать хелперы чужого
 * сервиса. Отличие одно — гигабайты: у Музыки они настоящие (тысяча записей
 * это десятки гигабайт), и «2048 МБ» в сводке админки читается плохо.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "0 Б";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} ГБ`;
}
