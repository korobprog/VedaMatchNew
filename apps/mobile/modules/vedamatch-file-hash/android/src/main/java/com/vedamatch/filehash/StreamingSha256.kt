package com.vedamatch.filehash

import java.io.InputStream
import java.security.MessageDigest

/**
 * Потоковый SHA-256 (VED-176, итерация 3): чистая JVM-логика без Android —
 * поэтому покрыта обычным JUnit-тестом (`StreamingSha256Test`, векторы NIST и
 * большой детерминированный файл против эталонного хеша `node:crypto`).
 *
 * Память — один буфер `bufferSize` (1 МиБ) независимо от размера файла.
 * `MessageDigest` берётся у системного провайдера (на Android — Conscrypt/
 * BoringSSL с аппаратными инструкциями SHA на ARMv8), это на два порядка
 * быстрее JS-реализации на Hermes (~1 МБ/с на A51, замер раунда 002).
 */
object StreamingSha256 {
  const val DEFAULT_BUFFER_BYTES = 1024 * 1024

  class Cancelled : RuntimeException("Проверка файла отменена")

  /**
   * @param onProgress вызывается после каждого прочитанного буфера с числом
   *   уже прохешированных байт.
   * @param isCancelled проверяется перед каждым чтением; `true` — [Cancelled].
   */
  fun hex(
    input: InputStream,
    bufferSize: Int = DEFAULT_BUFFER_BYTES,
    onProgress: (Long) -> Unit = {},
    isCancelled: () -> Boolean = { false },
  ): String {
    require(bufferSize > 0) { "bufferSize должен быть > 0" }
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(bufferSize)
    var total = 0L
    while (true) {
      if (isCancelled()) throw Cancelled()
      val read = input.read(buffer)
      if (read < 0) break
      if (read == 0) continue
      digest.update(buffer, 0, read)
      total += read
      onProgress(total)
    }
    if (isCancelled()) throw Cancelled()
    return toHex(digest.digest())
  }

  fun toHex(bytes: ByteArray): String {
    val out = StringBuilder(bytes.size * 2)
    for (b in bytes) {
      val v = b.toInt() and 0xff
      out.append(HEX[v ushr 4]).append(HEX[v and 0x0f])
    }
    return out.toString()
  }

  private val HEX = "0123456789abcdef".toCharArray()
}
