/**
 * Реакция `SessionProvider` на изменение токенов, пришедшее НЕ от него самого
 * (`tokenAuthority.subscribe`, `session.tsx`) — например, фоновое отклонение
 * звонка (`background-call-action.ts`) обновило или стёрло пару, пока приложение
 * было свёрнуто (`gan-harness/feedback/feedback-002.md`, блокирующий п.1).
 *
 * Вынесено чистой функцией специально: в `session.tsx` предыдущая версия
 * решала это прямо в колбэке подписки, читая `status` из замыкания
 * React-компонента — классическая stale closure (эффект с зависимостью
 * `[scheduleRefresh]`, а `scheduleRefresh` стабилен на весь процесс, значит
 * эффект и колбэк внутри создаются ровно один раз, замыкание навсегда
 * помнит `status`, какой он был при монтировании). Чистая функция не имеет
 * такой проблемы по построению — вызывающий код (`session.tsx`) обязан
 * передать АКТУАЛЬНЫЙ статус явно (через `ref`, не через замыкание рендера).
 */
export type SessionStatus = 'loading' | 'guest' | 'signed';

export type SessionTokenReaction =
  /** Пока сессия ещё восстанавливается при старте — своя логика в эффекте
   *  восстановления уже разберётся с этим же изменением сама; реагировать
   *  здесь ещё раз означало бы гонку двух источников статуса. */
  | 'ignore'
  /** Токены появились, пока считали себя гостем — сесть как вошедший. */
  | 'mark-signed'
  /** Токены пропали, пока считали себя вошедшим — выйти в гостя. */
  | 'mark-guest'
  /** Уже вошедшие, токены просто обновились (обычный случай refresh) —
   *  перепланировать таймер, статус не трогать. */
  | 'reschedule';

export function reactToTokenChange(current: SessionStatus, hasTokens: boolean): SessionTokenReaction {
  if (current === 'loading') return 'ignore';
  if (hasTokens) return current === 'signed' ? 'reschedule' : 'mark-signed';
  return current === 'guest' ? 'ignore' : 'mark-guest';
}
