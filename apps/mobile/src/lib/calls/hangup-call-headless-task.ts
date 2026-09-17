import { hangupCallInBackground } from './background-call-action';

export interface HangupCallHeadlessTaskData {
  callId?: string;
}

/**
 * Headless JS задача «Завершить» из `CallForegroundService.onTaskRemoved()`
 * (VED-222, п.1 — исправление `feedback-001.md`, блокирующий п.2: приложение
 * смахнули из списка последних задач во время разговора, Activity уже
 * разрушается, JS-мост может не дожить до обработки обычного события).
 * Регистрируется в `index.js` под именем `VedamatchCallHangup` — должно
 * буквально совпадать с `HangupHeadlessTaskService.TASK_NAME`
 * в `modules/vedamatch-calls/android`, иначе `HeadlessJsTaskService` не
 * найдёт задачу и тихо ничего не сделает. Локальная уборка (self-managed
 * `Connection`, уведомление, служба) уже сделана нативной стороной
 * синхронно, до запуска этой задачи — здесь только сетевой факт для
 * сервера и собеседника.
 */
export async function hangupCallHeadlessTask(data: HangupCallHeadlessTaskData): Promise<void> {
  if (!data?.callId) return;
  await hangupCallInBackground(data.callId);
}
