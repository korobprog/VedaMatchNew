package com.vedamatch.calls

import android.app.NotificationManager
import android.app.PictureInPictureParams
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.telecom.PhoneAccount
import android.telecom.DisconnectCause
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

    /**
     * Регистрирует self-managed `PhoneAccount` — идемпотентно и БЕЗ
     * предварительной проверки `getPhoneAccount()` (живой лог Samsung
     * Galaxy A51, Android 13: `getPhoneAccount()` там бросает
     * `SecurityException: ... READ_PHONE_NUMBERS`, хотя self-managed
     * аккаунту (`CAPABILITY_SELF_MANAGED`) это разрешение по документации
     * не требуется вовсе — конкретная прошивка проверяет его для ЛЮБОГО
     * вызывающего `getPhoneAccount()`, даже за собственный аккаунт
     * приложения). `registerPhoneAccount()` — обычный публичный API под
     * `MANAGE_OWN_CALLS` (уже выдан по объявлению в манифесте), повторный
     * вызов с тем же `PhoneAccountHandle` просто обновляет запись, не
     * бросает и не требует READ_PHONE_NUMBERS — раз проверка «уже
     * зарегистрирован ли» больше не нужна для идемпотентности, отдельный
     * читающий вызов, добавляющий риск SecurityException на части OEM,
     * можно просто убрать.
     */
    private fun ensurePhoneAccount(context: Context) {
      val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      val handle = phoneAccountHandle(context)
      val account = PhoneAccount.builder(handle, "VedaMatch")
        .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
        .build()
      telecomManager.registerPhoneAccount(account)
    }
  }

  private fun connectionSnapshot(connection: VedamatchConnection): Map<String, Any> = mapOf(
    "callId" to connection.callId,
    "state" to connection.stateLabel(),
    "ageMs" to connection.ageMs().toDouble(),
  )

  private fun expireStaleConnections() {
    for (connection in PendingCallStore.allConnections()) {
      if (connection.expireIfStale()) Log.w(TAG, "застрявшее соединение погашено, callId=${connection.callId}")
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
      if (PendingCallStore.isEnded(callId, System.currentTimeMillis())) {
        Log.w(TAG, "showIncomingCall: звонок уже завершён (call.ended пришёл раньше), не показываем, callId=$callId")
        return@AsyncFunction
      }
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
        Log.i(TAG, "showIncomingCall: PhoneAccount зарегистрирован, callId=$callId")
        val extras = android.os.Bundle().apply {
          putString(PendingCallStore.EXTRA_CALL_ID, callId)
          putString(PendingCallStore.EXTRA_CALLER_NAME, callerName)
          putString(PendingCallStore.EXTRA_KIND, kind)
          avatarUrl?.let { putString(PendingCallStore.EXTRA_AVATAR_URL, it) }
        }
        val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        telecomManager.addNewIncomingCall(phoneAccountHandle(context), extras)
        Log.i(TAG, "showIncomingCall: addNewIncomingCall отправлен, callId=$callId")
      } catch (error: Exception) {
        // Без лога на живом устройстве это будет нечем объяснить постфактум,
        // кроме «звонок почему-то не поднял self-managed соединение»
        // (feedback-002.md, non-blocking п.4).
        Log.w(TAG, "showIncomingCall: Telecom отказал, деградация до обычного уведомления, callId=$callId", error)
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

    AsyncFunction("endCall") { callId: String, reason: String ->
      Log.i(TAG, "endCall callId=$callId reason=$reason connection=${PendingCallStore.connectionFor(callId) != null}")
      // Прод-баг 2026-09-19: `call.ended` мог прийти, пока Telecom ещё не
      // создал соединение (`onCreateIncomingConnection` асинхронен после
      // `addNewIncomingCall`) — `connectionFor` тогда `null`, и созданное
      // следом соединение звонило бы вечно. Отметка закрывает эту дверь.
      PendingCallStore.markEnded(callId, System.currentTimeMillis())
      stopNetworkWatch()
      CallForegroundService.stop(context)
      CallNotifications.cancel(context, callId)
      PendingCallStore.connectionFor(callId)?.disconnectFromApp()
      PendingCallStore.removeInfo(callId)
      // Правка по факту живой проверки: снимает показ-поверх-блокировки/
      // turnScreenOn защитно — на случай, если звонок пропущен/снят ДО
      // того, как открылся сам экран звонка (`app/call/[id].tsx`) и успел
      // вызвать `setCallScreenActive(false)` сам. Флаги мог выставить
      // синхронно `MainActivity.onCreate`/`onNewIntent` (§4,
      // `plugins/with-native-calls.js`) сразу по полноэкранному `Intent`,
      // не дожидаясь React-дерева вовсе.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        appContext.currentActivity?.let {
          it.setShowWhenLocked(false)
          it.setTurnScreenOn(false)
        }
      }
    }

    /**
     * VED-222, п.7: «занято» решает JS (`call-busy-decision.ts`) — этот
     * вызов только репортит два независимых факта, ничего не решает сам:
     * `hasOwnCall` — уже идёт свой self-managed звонок (`PendingCallStore`);
     * `systemBusy` — устройство занято ЧЕМ-ТО ЕЩЁ (сотовый разговор или
     * другое self-managed приложение).
     *
     * Правка по факту живой проверки (Samsung Galaxy A51, Android 13):
     * `TelecomManager.isInCall()` требует `READ_PHONE_STATE`
     * (`SecurityException` без него, живой лог устройства) — это разрешение
     * сознательно не добавляется в манифест (описано в задании и
     * `docs/mobile-calls-native.md` §12: правила Google Play для чувствительных
     * разрешений телефонии, самоуправляемому аккаунту оно и не должно быть
     * нужно). Замена — `AudioManager.getMode()`: `MODE_IN_CALL` система
     * выставляет сама для НАСТОЯЩЕГО сотового разговора (телефония GSM/VoLTE),
     * это публичный API без единого разрешения. `MODE_IN_COMMUNICATION`
     * сознательно не считается «занято» — его ставит наш же
     * `InCallManager.start()` на время СВОЕГО разговора (см.
     * `audio-session-policy.ts`), и другие VoIP-приложения делают то же самое;
     * отличить «наш разговор» от «чужого VoIP» этим полем нельзя, но наш
     * собственный уже покрыт отдельным флагом `hasOwnCall`
     * (`PendingCallStore.hasAnyConnection()`), а для стороннего VoIP
     * `MODE_IN_COMMUNICATION` — это как раз не такое надёжное «занято», ради
     * которого стоило бы рисковать ложным срабатыванием (человек мог просто
     * недавно закончить звонок в другом приложении, не сбросившем режим).
     *
     * `excludeCallId` (правка по факту живой проверки, Samsung Galaxy A51) —
     * звонок, который САМ проверяет «занято ли устройство ДРУГИМ звонком»,
     * не должен засчитывать самого себя: `PendingCallStore.putConnection()`
     * заносит запись про self-managed `Connection` уже в момент
     * `onCreateIncomingConnection` (пока звонок только звонит, задолго до
     * ответа) — плоский `hasAnyConnection()` поэтому всегда видел «свой
     * звонок идёт» для повторно доставленного/пришедшего с гонкой push
     * `call.incoming` ТОГО ЖЕ звонка и топил его decline'ом параллельно с
     * тем, что человек в этот момент отвечал на него изнутри приложения
     * (`native-call-bridge.ts#handleIncomingCallPush` передаёт сюда
     * `push.callId`; `call-provider.tsx#start()` для НОВОГО исходящего
     * звонка своего `callId` ещё не имеет — там аргумент пустая строка,
     * тогда считается любой существующий `Connection`, как и раньше).
     */
    Function("callConflictState") { excludeCallId: String ->
      // Застрявшие (не отвечены дольше `StaleCallPolicy.STALE_RING_AFTER_MS`)
      // гасим прямо здесь — занятостью они не являются (прод-баг 2026-09-19).
      expireStaleConnections()
      val hasOwnCall = if (excludeCallId.isEmpty())
        PendingCallStore.hasAnyConnection()
      else
        PendingCallStore.hasOtherConnection(excludeCallId)
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val systemBusy = audioManager.mode == AudioManager.MODE_IN_CALL
      val ownCalls = PendingCallStore.allConnections()
        .filter { it.callId != excludeCallId }
        .map { connectionSnapshot(it) }
      mapOf("hasOwnCall" to hasOwnCall, "systemBusy" to systemBusy, "ownCalls" to ownCalls)
    }

    /** Живые self-managed соединения — для сверки с сервером
     *  (`native-call-reconcile.ts`). Застрявшие гасятся до ответа. */
    Function("listConnections") {
      expireStaleConnections()
      PendingCallStore.allConnections().map { connectionSnapshot(it) }
    }

    /** Погасить соединения, о которых сервер уже не знает (JS решил это
     *  чистой функцией `selectConnectionsToEnd`). Вместе с уведомлением
     *  входящего и метаданными; `call.ended`-отметка — чтобы запоздавшее
     *  создание соединения для того же звонка не зазвонило снова. */
    Function("endConnections") { callIds: List<String> ->
      val now = System.currentTimeMillis()
      for (callId in callIds) {
        if (callId.isEmpty()) continue
        PendingCallStore.markEnded(callId, now)
        val connection = PendingCallStore.connectionFor(callId)
        Log.w(TAG, "endConnections: гасим соединение, которого нет на сервере, callId=$callId state=${connection?.stateLabel()}")
        connection?.terminateFromApp(DisconnectCause(DisconnectCause.REMOTE))
        CallNotifications.cancel(context, callId)
        PendingCallStore.removeInfo(callId)
      }
    }

    Function("getLaunchCall") {
      val launch = PendingCallStore.consumeLaunch() ?: return@Function null
      // Имя/вид/аватар — правка по факту живой проверки (Samsung Galaxy
      // A51, BUG B этапа VED-222): `fullScreenIntent` поднимает Activity
      // раньше, чем `reconcile()` (JS, `GET /chat/calls/active`) успевает
      // сходить на сервер, — до этого момента показать входящий было
      // нечем, JS видел только `callId`/`action` и ждал сеть. Эти три поля
      // уже лежат в `PendingCallStore.infoFor()` — их положил туда же
      // `showIncomingCall()` из пуша, которым звонок начался; `null`, если
      // информация уже вычищена (`removeInfo`, например, второй быстрый
      // `getLaunchCall()` подряд — тогда JS достроит карточку сам через
      // `reconcile()`, `action`/`callId` тут не пострадали).
      val info = PendingCallStore.infoFor(launch.callId)
      mapOf(
        "callId" to launch.callId,
        "action" to launch.action,
        "callerName" to info?.callerName,
        "kind" to info?.kind,
        "avatarUrl" to info?.avatarUrl,
      )
    }

    /**
     * VED-361: завести категорию «Звонки» заранее, не дожидаясь первого
     * вызова.
     *
     * До этого канал `calls` создавался лениво — в `showIncomingCall`, то
     * есть только когда звонок уже пришёл. Две беды разом: в системных
     * настройках приложения категории не было, и человек не мог настроить
     * её заранее; а пуш, который сервер шлёт в `calls` (пропущенный, зов в
     * комнату, фолбэк для устройств без нативного экрана), Android клал в
     * служебный `fallback`-канал — без звука звонка и без тумблера.
     *
     * Канал заводится один раз (`ensureChannel` сам проверяет наличие) и
     * ровно тем определением, что у входящего: системный рингтон, вибрация,
     * показ на экране блокировки. Заводить его из JS нельзя — через
     * `expo-notifications` рингтон и `VISIBILITY_PUBLIC` не выставить, а
     * созданный первым канал потом уже не переопределить.
     */
    Function("ensureCallChannel") {
      CallNotifications.ensureChannel(context)
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

    /**
     * Правка по факту живой проверки (Samsung Galaxy A51): `requestDismissKeyguard`
     * убран — вызывался безусловно при `active = true` и принудительно снимал
     * блокировку экрана при каждом ответе на звонок, хотя `setShowWhenLocked(true)`
     * уже показывает разговор ПОВЕРХ блокировки без её снятия, ровно как у
     * системной звонилки (ответить/говорить можно, не разблокируя телефон
     * для всего остального). Сами флаги теперь дублируют то, что уже
     * выставляет `MainActivity` синхронно в `onCreate`/`onNewIntent`
     * (`plugins/with-native-calls.js`, §4) — этот вызов остаётся как явный
     * путь СНЯТИЯ флагов, когда экран звонка размонтируется
     * (`app/call/[id].tsx`), и как путь их установки для случая, когда
     * человек открыл экран звонка НЕ через полноэкранный intent (например,
     * ответил тапом по баннеру внутри уже открытого приложения).
     */
    Function("setCallScreenActive") { active: Boolean ->
      val activity = appContext.currentActivity ?: return@Function
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        activity.setShowWhenLocked(active)
        activity.setTurnScreenOn(active)
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
