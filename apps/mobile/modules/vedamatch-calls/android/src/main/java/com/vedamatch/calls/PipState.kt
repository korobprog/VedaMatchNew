package com.vedamatch.calls

/**
 * Единственный флаг для «картинки в картинке» (VED-222, п.5) — читает
 * `MainActivity.onUserLeaveHint()` (правится плагином, `plugins/with-native-calls.js`,
 * `withMainActivity`), пишет `VedamatchCallsModule.setPipEligible` по
 * решению JS (`app/call/[id].tsx`: видеозвонок, разговор идёт, этот экран
 * смонтирован). Обычный статический объект, не `PendingCallStore` — тот про
 * жизненный цикл self-managed `Connection`, это же не завязано на Telecom
 * вовсе (PiP работает даже для звонка, отвеченного целиком внутри уже
 * открытого приложения без Telecom-регистрации, см.
 * `docs/mobile-calls-native.md` §12).
 */
object PipState {
  @Volatile
  var eligible: Boolean = false
}
