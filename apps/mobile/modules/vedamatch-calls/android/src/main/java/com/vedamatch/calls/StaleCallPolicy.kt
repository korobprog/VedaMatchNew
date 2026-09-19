package com.vedamatch.calls

/**
 * Чистые правила «звонок застрял» — без Android-API, поэтому покрыты
 * JVM-тестом (`StaleCallPolicyTest`) без устройства.
 *
 * Прод-баг 2026-09-19 (Samsung A51, `dumpsys telecom`, `TC@18`): входящий
 * self-managed `Connection` остался в `RINGING` навсегда — `call.ended`
 * пришёл, пока Telecom ещё только создавал соединение, `endCall` не нашёл
 * его и снял только метаданные. С этого момента `callConflictState` видел
 * «свой звонок идёт» и любой исходящий/входящий получал «Устройство сейчас
 * занято другим звонком», пока приложение не остановили принудительно.
 */
object StaleCallPolicy {
  /** Серверный таймер дозвона — `RING_TIMEOUT_MS` в
   *  `apps/api/src/modules/chat/calls/call-state.ts`. Совпадение сверяет
   *  jest-тест `call-ring-timeout.spec.ts` (читает оба файла). */
  const val SERVER_RING_TIMEOUT_MS = 45_000L

  /** Сверх серверного таймера — запас на доставку пуша и на то, что
   *  соединение создаётся позже, чем сервер завёл звонок. Тот же запас, что
   *  у серверного `BUSY_TTL_RINGING_MS`. */
  const val STALE_GRACE_MS = 15_000L

  /** Звонящий/набирающий `Connection` старше этого — сервер его уже точно
   *  закрыл: гасим сами и не считаем занятостью. */
  const val STALE_RING_AFTER_MS = SERVER_RING_TIMEOUT_MS + STALE_GRACE_MS

  /** `ringing` — ещё не отвеченный (входящий звонит или исходящий набирает).
   *  Идущий разговор по возрасту не протухает: он длится сколько угодно. */
  fun isStale(ringing: Boolean, ageMs: Long): Boolean = ringing && ageMs >= STALE_RING_AFTER_MS
}

/**
 * «Этот звонок уже закончен» для `callId`, у которого ещё нет `Connection`.
 * `endCall` приходит раньше, чем Telecom вызвал `onCreateIncomingConnection`
 * (гонка data-пушей `call.incoming` → `call.ended` на холодном старте) —
 * отметка остаётся здесь, и соединение, созданное следом, сразу отклоняется
 * вместо того, чтобы звонить вечно. Потокобезопасность — на вызывающем
 * (`PendingCallStore` держит экземпляр под своим `@Synchronized`).
 */
class EndedCallTombstones(
  private val ttlMs: Long = 10 * 60_000L,
  private val maxSize: Int = 64,
) {
  private val endedAt = LinkedHashMap<String, Long>()

  fun mark(callId: String, nowMs: Long) {
    if (callId.isEmpty()) return
    sweep(nowMs)
    endedAt.remove(callId)
    endedAt[callId] = nowMs
    while (endedAt.size > maxSize) {
      val oldest = endedAt.keys.first()
      endedAt.remove(oldest)
    }
  }

  fun isEnded(callId: String, nowMs: Long): Boolean {
    sweep(nowMs)
    return endedAt.containsKey(callId)
  }

  private fun sweep(nowMs: Long) {
    val iterator = endedAt.entries.iterator()
    while (iterator.hasNext()) {
      if (nowMs - iterator.next().value > ttlMs) iterator.remove()
    }
  }
}
