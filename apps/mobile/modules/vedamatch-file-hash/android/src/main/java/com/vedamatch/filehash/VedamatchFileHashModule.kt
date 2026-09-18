package com.vedamatch.filehash

import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap

/**
 * `VedamatchFileHash` — SHA-256 файла на нативной стороне (VED-176, итерация 3).
 * `AsyncFunction` Expo выполняется не на главном потоке и не на JS-потоке,
 * так что 160 МБ читаются и хешируются, не трогая интерфейс. Прогресс —
 * событие `progress` не чаще раза на 4 МиБ; отмена — `cancel(jobId)`.
 */
class VedamatchFileHashModule : Module() {
  private val cancelled = ConcurrentHashMap.newKeySet<String>()

  override fun definition() = ModuleDefinition {
    Name("VedamatchFileHash")

    Events("progress")

    AsyncFunction("sha256File") { uri: String, jobId: String ->
      cancelled.remove(jobId)
      try {
        val (stream, totalBytes) = open(uri)
        var lastReported = 0L
        stream.use { input ->
          StreamingSha256.hex(
            input,
            onProgress = { hashed ->
              if (hashed - lastReported >= PROGRESS_STEP_BYTES || hashed == totalBytes) {
                lastReported = hashed
                sendEvent("progress", mapOf("jobId" to jobId, "bytesHashed" to hashed, "totalBytes" to totalBytes))
              }
            },
            isCancelled = { cancelled.contains(jobId) },
          )
        }
      } catch (e: StreamingSha256.Cancelled) {
        throw HashCancelledException()
      } finally {
        cancelled.remove(jobId)
      }
    }

    Function("cancel") { jobId: String ->
      cancelled.add(jobId)
    }
  }

  private fun open(uri: String): Pair<InputStream, Long> {
    val parsed = Uri.parse(uri)
    return when (parsed.scheme) {
      null, "file" -> {
        val file = File(parsed.path ?: uri)
        if (!file.isFile) throw FileNotFoundCodedException(uri)
        FileInputStream(file) to file.length()
      }
      "content" -> {
        val context = appContext.reactContext ?: throw FileNotFoundCodedException(uri)
        val size = context.contentResolver.openAssetFileDescriptor(parsed, "r")?.use { it.length } ?: -1L
        val stream = context.contentResolver.openInputStream(parsed) ?: throw FileNotFoundCodedException(uri)
        stream to size
      }
      else -> throw FileNotFoundCodedException(uri)
    }
  }

  private class HashCancelledException : CodedException("ERR_HASH_CANCELLED", "Проверка файла отменена", null)

  private class FileNotFoundCodedException(uri: String) :
    CodedException("ERR_FILE_NOT_FOUND", "Файл не найден: $uri", null)

  companion object {
    private const val PROGRESS_STEP_BYTES = 4L * 1024 * 1024
  }
}
