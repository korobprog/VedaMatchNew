/**
 * Разбор JSON, присланного моделью.
 *
 * Часть моделей игнорирует `response_format: json_object` и оборачивает ответ
 * в markdown-ограждение — ```json … ```. JSON.parse на таком падает, и
 * совершенно исправный вердикт превращался в «модель ответила неразборчиво».
 * Проверено на живом релее: так отвечает claude-haiku-4-5.
 */
export function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/, '')
    .trim();
}
