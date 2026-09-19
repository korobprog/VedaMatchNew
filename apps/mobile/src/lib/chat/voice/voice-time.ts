/**
 * Форматирование времени голосового: длительность и прошедшее время в
 * плеере, таймер записи. Одна функция на оба случая — секунды всегда целые
 * и не бывают отрицательными к моменту показа.
 */
export function formatVoiceTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return `${hours}:${String(restMinutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
