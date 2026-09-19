package com.vedamatch.calls

import java.lang.ref.WeakReference

/**
 * Состояние звонков в процессе — общее для модуля (`VedamatchCallsModule`),
 * `ConnectionService`/`Connection` и `CallActionReceiver`, которые все живут
 * в одном процессе приложения, но не имеют друг у друга прямых ссылок
 * (Telecom создаёт `Connection` сам, `BroadcastReceiver` получает только
 * `Intent`). Один статический объект вместо протаскивания ссылок через
 * систему — так же, как `ExpoLinkingModule.initialURL` в expo-linking.
 */
object PendingCallStore {
  /** Ключи `extras`, которыми `showIncomingCall` (`VedamatchCallsModule`)
   *  передаёт метаданные через `TelecomManager.addNewIncomingCall` —
   *  единственный способ донести их до `onCreateIncomingConnection`,
   *  которую вызывает система, а не наш код. */
  const val EXTRA_CALL_ID = "callId"
  const val EXTRA_CALLER_NAME = "callerName"
  const val EXTRA_KIND = "kind"
  const val EXTRA_AVATAR_URL = "avatarUrl"

  data class CallInfo(
    val callId: String,
    val callerName: String,
    val kind: String,
    val avatarUrl: String?,
    val notificationId: Int,
  )

  /** Чем в следующий раз должна открыться Activity — потребляется один раз
   *  (`VedamatchCallsModule.getLaunchCall`). */
  data class LaunchCall(val callId: String, val action: String)

  private val connections = HashMap<String, WeakReference<VedamatchConnection>>()
  private val infos = HashMap<String, CallInfo>()
  private val endedCalls = EndedCallTombstones()

  @Volatile
  private var pendingLaunch: LaunchCall? = null

  @Synchronized
  fun putConnection(callId: String, connection: VedamatchConnection) {
    connections[callId] = WeakReference(connection)
  }

  @Synchronized
  fun connectionFor(callId: String): VedamatchConnection? = connections[callId]?.get()

  @Synchronized
  fun removeConnection(callId: String) {
    connections.remove(callId)
  }

  /** Единственный активный звонок, если он есть — приложение поддерживает
   *  ровно один одновременный self-managed звонок (VED-222, §7 спеки:
   *  «занято»/onTaskRemoved читают именно это). Возвращает первую живую
   *  ссылку; мёртвые (`WeakReference` съедена GC) пропускает и вычищает. */
  @Synchronized
  fun anyConnection(): VedamatchConnection? {
    val iterator = connections.entries.iterator()
    while (iterator.hasNext()) {
      val entry = iterator.next()
      val connection = entry.value.get()
      if (connection == null) {
        iterator.remove()
        continue
      }
      return connection
    }
    return null
  }

  /** Есть ли вообще зарегистрированный self-managed звонок (наш собственный,
   *  неважно активный или ещё звонящий) — используется для «занято» при
   *  повторном входящем (`callConflictState` в `VedamatchCallsModule`). */
  @Synchronized
  fun hasAnyConnection(): Boolean = anyConnection() != null

  /**
   * Тот же вопрос, но исключая ОДИН конкретный `callId` — правка по факту
   * живой проверки (Samsung Galaxy A51, живой лог: «Ответить» на входящий
   * привело к decline того же звонка). `PendingCallStore.putConnection()`
   * заносит запись про звонок ЕЩЁ ДО того, как на него ответили (в момент
   * `onCreateIncomingConnection`, пока он только звонит) — плоское
   * `hasAnyConnection()` в `callConflictState` поэтому уже видело «свой
   * звонок идёт» для ТОГО ЖЕ САМОГО звонка, которому пришёл повторно
   * доставленный (или пришедший с гонкой по времени) push `call.incoming`:
   * `handleIncomingCallPush` (`native-call-bridge.ts`) читал это как
   * «занято» и слал `decline` на сервер параллельно с тем, что человек в
   * этот момент уже отвечал на ЭТОТ ЖЕ звонок изнутри приложения. Занятость
   * своим ЖЕ звонком, для которого пришёл повторный push, — не конфликт,
   * конфликт — только ВТОРОЙ, ДРУГОЙ звонок.
   */
  @Synchronized
  fun hasOtherConnection(excludeCallId: String): Boolean {
    val iterator = connections.entries.iterator()
    while (iterator.hasNext()) {
      val entry = iterator.next()
      val connection = entry.value.get()
      if (connection == null) {
        iterator.remove()
        continue
      }
      if (connection.callId != excludeCallId) return true
    }
    return false
  }

  /** Все живые соединения — для сверки с сервером и с порогом «застрял»
   *  (`VedamatchCallsModule.listConnections`/`endConnections`). */
  @Synchronized
  fun allConnections(): List<VedamatchConnection> {
    val result = ArrayList<VedamatchConnection>()
    val iterator = connections.entries.iterator()
    while (iterator.hasNext()) {
      val connection = iterator.next().value.get()
      if (connection == null) iterator.remove() else result.add(connection)
    }
    return result
  }

  /** Звонок закончен, а соединения ещё нет — см. `EndedCallTombstones`. */
  @Synchronized
  fun markEnded(callId: String, nowMs: Long) {
    endedCalls.mark(callId, nowMs)
  }

  @Synchronized
  fun isEnded(callId: String, nowMs: Long): Boolean = endedCalls.isEnded(callId, nowMs)

  @Synchronized
  fun putInfo(info: CallInfo) {
    infos[info.callId] = info
  }

  @Synchronized
  fun infoFor(callId: String): CallInfo? = infos[callId]

  @Synchronized
  fun removeInfo(callId: String) {
    infos.remove(callId)
  }

  fun setPendingLaunch(callId: String, action: String) {
    pendingLaunch = LaunchCall(callId, action)
  }

  /** Одноразовое чтение: второй вызов подряд без нового запуска — `null`. */
  @Synchronized
  fun consumeLaunch(): LaunchCall? {
    val value = pendingLaunch
    pendingLaunch = null
    return value
  }
}
