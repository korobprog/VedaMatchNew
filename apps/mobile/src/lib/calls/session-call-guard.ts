import type { SessionStatus } from '@/lib/auth/session';
import type { CallPhase } from './call-machine';

/**
 * Что делать со звонком при смене статуса сессии (VED-222 — исправление
 * `gan-harness/feedback/feedback-002.md`, блокирующий п.1). `CallProvider`
 * смонтирован в `_layout.tsx` ВЫШЕ `Stack.Protected` (обёртывает весь
 * `RootStack`, не только защищённое дерево) — он не размонтируется, когда
 * `status` уходит в `'guest'`, и это осознанно (входящий должен показаться
 * из любого места, а не только из вошедшего дерева): значит единственный
 * способ узнать «пора закончить звонок из-за выхода из аккаунта» — следить
 * за самим `status`, а не полагаться на unmount-cleanup, который в реальном
 * дереве приложения не наступает никогда.
 *
 * Выход из аккаунта ВО ВРЕМЯ разговора иначе оставлял бы его физически
 * идущим (микрофон/камера захвачены, постоянное уведомление «Идёт звонок»,
 * self-managed `Connection` жив) при том, что UI уже показывает экран
 * входа — скрытая утечка микрофона/камеры после явного действия «выйти».
 */
export function shouldEndCallOnSessionChange(
  previous: SessionStatus,
  next: SessionStatus,
  phase: CallPhase,
): boolean {
  if (previous !== 'signed' || next !== 'guest') return false;
  return phase !== 'idle' && phase !== 'ended';
}
