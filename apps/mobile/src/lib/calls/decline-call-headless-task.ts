import { declineCallInBackground } from './background-call-action';

export interface DeclineCallHeadlessTaskData {
  callId?: string;
}

/**
 * Headless JS задача «Отклонить» с экрана блокировки/из шторки (VED-221,
 * п.4). Регистрируется в `index.js` под именем `VedamatchCallDecline` —
 * должно буквально совпадать с `DeclineHeadlessTaskService.TASK_NAME`
 * в `modules/vedamatch-calls/android`, иначе `HeadlessJsTaskService` не
 * найдёт задачу и тихо ничего не сделает.
 */
export async function declineCallHeadlessTask(data: DeclineCallHeadlessTaskData): Promise<void> {
  if (!data?.callId) return;
  await declineCallInBackground(data.callId);
}
