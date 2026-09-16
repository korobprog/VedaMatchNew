package com.vedamatch.calls

import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.bridge.Arguments

/**
 * «Отклонить» из шторки/блокировки без открытия приложения (VED-221, п.4).
 * Тот же нативный механизм, которым `@react-native-firebase/messaging` сам
 * поднимает `setBackgroundMessageHandler` из убитого приложения
 * (`ReactNativeFirebaseMessagingHeadlessService` — идентичный
 * `startService` + `acquireWakeLockNow`), поэтому если фоновый обработчик
 * пуша уже надёжен, этот путь настолько же надёжен: то же семейство
 * гарантий Android, не отдельная гипотеза.
 *
 * Задача на JS-стороне — `declineCallHeadlessTask` в
 * `decline-call-headless-task.ts`, регистрируется в `index.js` рядом с
 * фоновым обработчиком FCM.
 */
class DeclineHeadlessTaskService : HeadlessJsTaskService() {
  companion object {
    const val TASK_NAME = "VedamatchCallDecline"
    private const val TIMEOUT_MS = 20_000L

    fun start(context: Context, callId: String) {
      val intent = Intent(context, DeclineHeadlessTaskService::class.java)
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
