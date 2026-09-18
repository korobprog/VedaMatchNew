package com.vedamatch.filehash

import java.io.ByteArrayInputStream
import java.io.InputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Эталоны — NIST (FIPS 180-4) и `node:crypto` на том же детерминированном
 * генераторе (LCG, как в `src/lib/self-update/sha256.spec.ts`): хеш нативного
 * пути обязан совпасть и с JS-хешером, и с `shasum` на Mac.
 */
class StreamingSha256Test {
  /** Поток из LCG: state = state·1664525 + 1013904223 (mod 2³²), байт — старшие 8 бит. */
  private class LcgStream(private var remaining: Long, seed: Int) : InputStream() {
    private var state = seed
    override fun read(): Int {
      if (remaining <= 0) return -1
      remaining--
      state = state * 1664525 + 1013904223
      return state ushr 24
    }
    override fun read(b: ByteArray, off: Int, len: Int): Int {
      if (remaining <= 0) return -1
      val n = minOf(len.toLong(), remaining).toInt()
      for (i in 0 until n) {
        state = state * 1664525 + 1013904223
        b[off + i] = (state ushr 24).toByte()
      }
      remaining -= n
      return n
    }
  }

  private fun hexOf(text: String, buffer: Int = StreamingSha256.DEFAULT_BUFFER_BYTES) =
    StreamingSha256.hex(ByteArrayInputStream(text.toByteArray(Charsets.ISO_8859_1)), buffer)

  @Test fun nistVectors() {
    assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", hexOf(""))
    assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", hexOf("abc"))
    assertEquals(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
      hexOf("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    )
  }

  @Test fun resultDoesNotDependOnBufferSize() {
    for (buffer in listOf(1, 63, 64, 65, 4096, 1 shl 20)) {
      assertEquals(
        "dfa61f2648cb3dff591a876493cd8a95698fd8cecfc0d1cea0ab240cf60f1ebe",
        StreamingSha256.hex(LcgStream(100_003, 7), buffer),
      )
    }
  }

  @Test fun largeFileMatchesNodeCryptoAndReportsProgress() {
    val size = 160_000_003L
    var lastProgress = 0L
    var calls = 0
    val started = System.nanoTime()
    val hex = StreamingSha256.hex(LcgStream(size, 42), onProgress = {
      assertTrue("прогресс монотонный", it > lastProgress)
      lastProgress = it
      calls++
    })
    val ms = (System.nanoTime() - started) / 1_000_000
    println("StreamingSha256: ${size / 1_000_000} МБ за $ms мс (включая генерацию данных)")
    assertEquals("54b9d99697ba7cef0d12846548031a5af3661ebe40414e1d577a0e01c811ec57", hex)
    assertEquals(size, lastProgress)
    assertEquals(153, calls) // ceil(160 000 003 / 1 048 576)
  }

  @Test fun cancellationStopsReading() {
    var reads = 0
    try {
      StreamingSha256.hex(LcgStream(10_000_000, 1), bufferSize = 1 shl 20,
        onProgress = { reads++ }, isCancelled = { reads >= 3 })
      fail("ожидалась отмена")
    } catch (e: StreamingSha256.Cancelled) {
      assertEquals(3, reads)
    }
  }

  @Test fun hexIsLowercaseWithLeadingZeros() {
    assertEquals("00010f10ff", StreamingSha256.toHex(byteArrayOf(0, 1, 15, 16, -1)))
  }
}
