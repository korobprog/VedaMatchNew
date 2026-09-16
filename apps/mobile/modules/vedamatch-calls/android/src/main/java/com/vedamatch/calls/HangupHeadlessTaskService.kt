package com.vedamatch.calls

import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.bridge.Arguments

/**
 * «Завершить» из `CallForegroundService.onTaskRemoved()` (VED-222, п.1 —
 * исправление `feedback-001.md` этого этапа, блокирующий п.2). Тот же
 * механизм, что и `DeclineHeadlessTaskService` — `HeadlessJsTaskService` с
 * собственным wake lock, переживающий разрушение `Activity`, а не
 * `NativeEventEmitter` (`sendEndEvent`), у которого нет такой гарантии:
 * ровно в `onTaskRemoved` JS-мост с наибольшей вероятностью уже не отвечает.
 *
 * Локальная уборка (self-managed `Connection`, уведомление, сама служба)
 * делается синхронно в `CallForegroundService.onTaskRemoved()` до/после
 * запуска этой задачи — здесь только сетевой факт для сервера и
 * собеседника (`POST /chat/calls/:id/end`, `hangup-call-headless-task.ts`
 * → `background-call-action.ts`).
 *
 * Задача на JS-стороне — `hangupCallHeadlessTask`
 * (`hangup-call-headless-task.ts`), регистрируется в `index.js` под именем
 * `TASK_NAME` ниже — должно буквально совпадать.
 */
class HangupHeadlessTaskService : HeadlessJsTaskService() {
  companion object {
    const val TASK_NAME = "VedamatchCallHangup"
    private const val TIMEOUT_MS = 20_000L

    fun start(context: Context, callId: String) {
      val intent = Intent(context, HangupHeadlessTaskService::class.java)
      intent.putExtra("callId", callId)
      val name = context.startService(intent)
      if (name != null) HeadlessJsTaskService.acquireWakeLockNow(context)
    }
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val callId = intent?.getStringExtra("callId") ?: return null
    val data = Arguments.createMap()
    data.putString("callId", callId)
    return HeadlessJsTaskConfig(TASK_NAME, data, TIMEOUT_MS, false)
  }
}
