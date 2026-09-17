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
