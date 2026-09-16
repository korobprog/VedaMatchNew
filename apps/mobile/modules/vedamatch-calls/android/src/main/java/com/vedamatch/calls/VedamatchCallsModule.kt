package com.vedamatch.calls

import android.app.NotificationManager
import android.app.PictureInPictureParams
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import android.util.Rational
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

/**
 * Публичный JS-интерфейс модуля звонков (VED-221/222) — обёртка описана в
 * `modules/vedamatch-calls/index.ts`. Реализация опирается на self-managed
 * `ConnectionService` (`VedamatchConnectionService`/`VedamatchConnection`),
 * полноэкранные/постоянные уведомления (`CallNotifications`) и службу
 * переднего плана разговора (`CallForegroundService`); решения записаны в
 * `docs/mobile-calls-native.md`, §3 и §12.
 */
class VedamatchCallsModule : Module() {
  companion object {
    private const val ACCOUNT_ID = "vedamatch"
    private const val TAG = "VedamatchCalls"

    @Volatile
    private var instance: WeakReference<VedamatchCallsModule>? = null

    fun sendAnswerEvent(callId: String) {
      instance?.get()?.sendEvent("answer", mapOf("callId" to callId))
    }

    fun sendDeclineEvent(callId: String) {
      instance?.get()?.sendEvent("decline", mapOf("callId" to callId))
    }

    /** VED-222: Telecom (гарнитура/Bluetooth/Android Auto, преемption
     *  сотовым) или наша кнопка «Завершить» на уведомлении разговора положили
     *  трубку — см. `VedamatchConnection.onDisconnect`/`CallActionReceiver`. */
    fun sendEndEvent(callId: String) {
      instance?.get()?.sendEvent("end", mapOf("callId" to callId))
    }

    /** VED-222, п.5: `MainActivity.onPictureInPictureModeChanged` (плагин,
     *  `withMainActivity`) сообщает JS, вошли/вышли из PiP — экран звонка
     *  (`app/call/[id].tsx`) по этому прячет/возвращает кнопки. */
    fun sendPipModeChanged(inPip: Boolean) {
      instance?.get()?.sendEvent("pipModeChanged", mapOf("inPip" to inPip))
    }

    /** Контекст приложения для классов вне модуля (`VedamatchConnection`,
     *  `CallForegroundService`), у которых нет своего `Module.appContext`. */
    fun applicationContextOrNull(): Context? = instance?.get()?.appContext?.reactContext?.applicationContext

    private fun phoneAccountHandle(context: Context): PhoneAccountHandle =
      PhoneAccountHandle(ComponentName(context, VedamatchConnectionService::class.java), ACCOUNT_ID)

    private fun ensurePhoneAccount(context: Context) {
      val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      val handle = phoneAccountHandle(context)
      if (telecomManager.getPhoneAccount(handle) != null) return
      val account = PhoneAccount.builder(handle, "VedaMatch")
        .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
        .build()
      telecomManager.registerPhoneAccount(account)
    }
  }

  private val context: Context
    get() = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("VedamatchCalls: нет ReactContext")

  /** Слушатель смены транспорта сети (VED-222, п.6) — живёт ровно во время
   *  разговора, регистрируется в `startOngoingCall`, снимается в `endCall`.
   *  Решение «перезапускать ли ICE прямо сейчас» — не здесь: модуль только
   *  репортит факт смены транспорта, чистая логика — `ice-restart-policy.ts`
   *  на JS-стороне (спека там же), Kotlin ничего не решает. */
  private var networkCallback: ConnectivityManager.NetworkCallback? = null

  private fun currentTransport(): String {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = manager.activeNetwork ?: return "none"
    val caps = manager.getNetworkCapabilities(network) ?: return "none"
    return when {
      caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
      caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
      caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
      else -> "other"
    }
  }

  private fun startNetworkWatch() {
    if (networkCallback != null) return
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
        sendEvent("networkTransportChanged", mapOf("transport" to currentTransport()))
      }

      override fun onLost(network: Network) {
        sendEvent("networkTransportChanged", mapOf("transport" to "none"))
      }
    }
    try {
      manager.registerDefaultNetworkCallback(callback)
      networkCallback = callback
    } catch (error: Exception) {
      // ACCESS_NETWORK_STATE уже есть (плагин WebRTC, этап 0), но отказ
      // конкретного OEM не должен ронять сам звонок — просто не будет
      // немедленного перезапуска ICE при смене сети, останется обычный
      // таймер обрыва (`webrtc-session.ts`, `DISCONNECT_GRACE_MS`).
      Log.w(TAG, "Не удалось подписаться на смену сети", error)
    }
  }

  private fun stopNetworkWatch() {
    val callback = networkCallback ?: return
    networkCallback = null
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    try {
      manager.unregisterNetworkCallback(callback)
    } catch (_: Exception) {
      // Уже отписан (например, второй `endCall` подряд) — не наша забота.
    }
  }

  override fun definition() = ModuleDefinition {
    Name("VedamatchCalls")

    Events("answer", "decline", "end", "networkTransportChanged", "pipModeChanged")

    OnCreate {
      instance = WeakReference(this@VedamatchCallsModule)
    }

    OnDestroy {
      stopNetworkWatch()
    }

    AsyncFunction("showIncomingCall") { options: ShowIncomingCallOptions ->
      val callId = options.callId
      if (callId.isEmpty()) return@AsyncFunction
      val callerName = options.callerName
      val kind = options.kind
      val avatarUrl = options.avatarUrl

      val notificationId = CallNotifications.notificationIdFor(callId)
      val info = PendingCallStore.CallInfo(
        callId = callId,
        callerName = callerName,
        kind = kind,
        avatarUrl = avatarUrl,
        notificationId = notificationId,
      )
      PendingCallStore.putInfo(info)

      // Отказ Telecom (конфликт с другим self-managed приложением, запрет
      // конкретного OEM, SecurityException при регистрации PhoneAccount)
      // не должен топить звонок молча — деградация до того же уведомления,
      // которое в штатном пути рисует `Connection.onShowIncomingCallUi()`
      // (`CallNotifications`), просто без самого self-managed звонка и
      // системной интеграции с ним (feedback-001.md, non-blocking п.1).
      try {
        ensurePhoneAccount(context)
        val extras = android.os.Bundle().apply {
          putString(PendingCallStore.EXTRA_CALL_ID, callId)
          putString(PendingCallStore.EXTRA_CALLER_NAME, callerName)
          putString(PendingCallStore.EXTRA_KIND, kind)
          avatarUrl?.let { putString(PendingCallStore.EXTRA_AVATAR_URL, it) }
        }
        val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        telecomManager.addNewIncomingCall(phoneAccountHandle(context), extras)
      } catch (error: Exception) {
        // Без лога на живом устройстве это будет нечем объяснить постфактум,
        // кроме «звонок почему-то не поднял self-managed соединение»
        // (feedback-002.md, non-blocking п.4).
        Log.w(TAG, "Telecom отказал, деградация до обычного уведомления", error)
        CallNotifications.show(context, info)
      }
    }

    /**
     * VED-222, п.1: система должна знать про исходящий разговор так же, как
     * про входящий — `TelecomManager.placeCall` для self-managed аккаунта
     * (не `CALL_PHONE`/обычный набор номера: наш `PhoneAccount` объявлен
     * `CAPABILITY_SELF_MANAGED`, поэтому достаточно уже выданного
     * `MANAGE_OWN_CALLS`). Best-effort, как и `showIncomingCall`: отказ
     * Telecom не должен мешать самому WebRTC-дозвону, который от него не
     * зависит (`call-provider.tsx` не ждёт результата).
     */
    AsyncFunction("placeOutgoingCall") { options: OngoingCallOptions ->
      val callId = options.callId
      if (callId.isEmpty()) return@AsyncFunction
      try {
        ensurePhoneAccount(context)
        val extras = android.os.Bundle().apply {
          putString(PendingCallStore.EXTRA_CALL_ID, callId)
          putString(PendingCallStore.EXTRA_CALLER_NAME, options.callerName)
          putString(PendingCallStore.EXTRA_KIND, options.kind)
          putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, phoneAccountHandle(context))
        }
        val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        val address = Uri.fromParts("tel", "vedamatch-$callId", null)
        telecomManager.placeCall(address, extras)
      } catch (error: Exception) {
        Log.w(TAG, "Telecom отказал в регистрации исходящего", error)
      }
    }

    /**
     * VED-222, п.1: разговор пошёл (`state.phase === 'active'` в
     * `call-provider.tsx`, для обеих ролей) — перевести self-managed
     * `Connection` в активное состояние, если он вообще был зарегистрирован
     * (`placeOutgoingCall`/`showIncomingCall` — для звонка, отвеченного
     * целиком внутри уже открытого приложения без пуша, соединения может не
     * быть вовсе, тогда это no-op, см. `docs/mobile-calls-native.md` §12,
     * «известное ограничение»), поднять службу переднего плана с постоянным
     * уведомлением и начать слушать смену сети.
     */
    AsyncFunction("startOngoingCall") { options: OngoingCallOptions ->
      val callId = options.callId
      if (callId.isEmpty()) return@AsyncFunction
      PendingCallStore.connectionFor(callId)?.setActive()
      CallForegroundService.start(context, callId, options.callerName, options.kind)
      startNetworkWatch()
    }

    AsyncFunction("endCall") { callId: String, _: String ->
      stopNetworkWatch()
      CallForegroundService.stop(context)
      CallNotifications.cancel(context, callId)
      PendingCallStore.connectionFor(callId)?.disconnectFromApp()
      PendingCallStore.removeInfo(callId)
    }

    /**
     * VED-222, п.7: «занято» решает JS (`call-busy-decision.ts`) — этот
     * вызов только репортит два независимых факта, ничего не решает сам:
     * `hasOwnCall` — уже идёт свой self-managed звонок (`PendingCallStore`);
     * `systemBusy` — Telecom считает устройство занятым чем-то ещё
     * (сотовый разговор или другое self-managed приложение). Обёрнуто в
     * `try/catch`: `TelecomManager.isInCall()` без `READ_PHONE_STATE` на
     * части OEM/версий может бросить `SecurityException` — тогда считаем
     * систему свободной (fail-open): ложное «не занято» просто покажет
     * входящий баннер как обычно, а не потеряет звонок молча.
     */
    Function("callConflictState") {
      val hasOwnCall = PendingCallStore.hasAnyConnection()
      val systemBusy = try {
        val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        telecomManager.isInCall()
      } catch (error: Exception) {
        Log.w(TAG, "Не удалось спросить Telecom про занятость устройства", error)
        false
      }
      mapOf("hasOwnCall" to hasOwnCall, "systemBusy" to systemBusy)
    }

    Function("getLaunchCall") {
      val launch = PendingCallStore.consumeLaunch() ?: return@Function null
      mapOf("callId" to launch.callId, "action" to launch.action)
    }

    Function("canUseFullScreenIntent") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        true
      } else {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.canUseFullScreenIntent()
      }
    }

    Function("openFullScreenIntentSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
          data = Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
      }
    }

    Function("setCallScreenActive") { active: Boolean ->
      val activity = appContext.currentActivity ?: return@Function
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        activity.setShowWhenLocked(active)
        activity.setTurnScreenOn(active)
      }
      if (active) {
        val keyguard = activity.getSystemService(Context.KEYGUARD_SERVICE) as? android.app.KeyguardManager
        keyguard?.requestDismissKeyguard(activity, null)
      }
    }

    /**
     * VED-222, п.5: картинка в картинке — только видеозвонок, только пока
     * `app/call/[id].tsx` смонтирован и разговор `active`
     * (`call-provider.tsx` решает это тем же способом, что и
     * `startOngoingCall`/`shouldKeepScreenAwake`, но здесь решение принимает
     * сам экран звонка, не провайдер — PiP это состояние конкретного экрана,
     * а не звонка вообще). На API 31+ включает автовход
     * (`setAutoEnterEnabled`) — система сама поднимает PiP, когда человек
     * уходит домой/переключает приложение, без вызова
     * `enterPictureInPictureMode()` из кода. На API 26-30 автовхода нет:
     * `MainActivity.onUserLeaveHint()` (плагин, `withMainActivity`) читает
     * `PipState.eligible` и входит в PiP вручную. Ниже API 26 — PiP не
     * поддерживается системой вовсе, вызов no-op.
     */
    Function("setPipEligible") { eligible: Boolean ->
      PipState.eligible = eligible
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function
      val activity = appContext.currentActivity ?: return@Function
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val params = PictureInPictureParams.Builder()
          .setAspectRatio(Rational(9, 16))
          .setAutoEnterEnabled(eligible)
          .build()
        try {
          activity.setPictureInPictureParams(params)
        } catch (error: Exception) {
          Log.w(TAG, "Не удалось обновить параметры PiP", error)
        }
      }
    }
  }
}
