/**
 * Смещение в минутах → «UTC+5:30». Получасовые пояса встречаются чаще, чем
 * кажется.
 *
 * Отдельным модулем, а не внутри формы: форма клиентская, а подпись со
 * смещением рисуют и серверные страницы — вызов клиентской функции с сервера
 * Next отвергает.
 */
export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return rest === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${String(rest).padStart(2, "0")}`;
}
