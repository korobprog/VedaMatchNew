package com.vedamatch.calls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telecom.DisconnectCause

/**
 * Действия «Ответить»/«Отклонить»/«Завершить» из уведомления (VED-221 п.1/4,
 * VED-222 п.1). Работает без открытия UI и без живого JS: получатель —
 * обычный `BroadcastReceiver`, система поднимает процесс приложения сама,
 * если он был убит, точно так же, как для доставки самого FCM-пуша.
 *
 * «Ответить» переводит self-managed `Connection` в `active` и открывает
 * приложение — экран звонка сам примет вызов через `getLaunchCall()`
 * (`native-call-bridge.ts`), реального HTTP `accept` здесь нет: его делает
 * `chat-calls-client.ts` уже внутри работающего приложения, у него для этого
 * есть токены сессии и, если понадобится, живой WebRTC. «Отклонить» —
 * наоборот, не должно открывать UI вовсе: запускает headless-задачу
 * (`DeclineHeadlessTaskService`), которая сама сходит на
 * `POST /chat/calls/:id/decline` (`background-call-action.ts`). «Завершить» —
 * кнопка на уведомлении уже ИДУЩЕГО разговора (`CallForegroundService`,
 * `CallNotifications.buildOngoing`): рвёт self-managed `Connection` и шлёт
 * JS то же событие `end`, что и `Connection.onDisconnect()` (гарнитура,
 * Bluetooth, Android Auto) — один обработчик на все «системные» способы
 * положить трубку, `call-provider.tsx` зовёт обычный `hangUp()`.
 */
class CallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val callId = intent.getStringExtra(CallNotifications.EXTRA_CALL_ID) ?: return

    when (intent.action) {
      "com.vedamatch.calls.ANSWER" -> {
        CallNotifications.cancel(context, callId)
        PendingCallStore.connectionFor(callId)?.setActive()
        PendingCallStore.setPendingLaunch(callId, "answer")
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
          ?: Intent(Intent.ACTION_MAIN).setPackage(context.packageName)
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        launch.putExtra(CallNotifications.EXTRA_CALL_ID, callId)
        launch.putExtra(CallNotifications.EXTRA_ACTION, "answer")
        context.startActivity(launch)
        VedamatchCallsModule.sendAnswerEvent(callId)
      }

      "com.vedamatch.calls.DECLINE" -> {
        CallNotifications.cancel(context, callId)
        PendingCallStore.connectionFor(callId)?.let {
          it.setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
          it.destroy()
        }
        PendingCallStore.removeConnection(callId)
        DeclineHeadlessTaskService.start(context, callId)
      }

      "com.vedamatch.calls.END" -> {
        CallForegroundService.stop(context)
        PendingCallStore.connectionFor(callId)?.disconnectFromApp()
        VedamatchCallsModule.sendEndEvent(callId)
      }
    }
  }
}
