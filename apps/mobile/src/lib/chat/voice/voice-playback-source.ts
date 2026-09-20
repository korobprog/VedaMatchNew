/**
 * Откуда плееру брать байты (VED-290): своя только что записанная/отправленная
 * запись — из локального файла (`voice-local-file-cache.ts`), уже лежащего
 * на диске, мгновенно и без сети; всё остальное — чужие записи и свои после
 * перезапуска приложения, когда локального файла уже нет, — с сервера по
 * `attachment.url`, как раньше.
 *
 * Проверка существования файла вынесена параметром (`fileExists`), а не
 * жёстко завязана на `expo-file-system`, — так решение тестируется без мока
 * файловой системы, а сам вызов `FileSystem.getInfoAsync` остаётся тонкой
 * необёрнутой строкой в `voice-message-player.tsx`.
 */

export interface VoicePlaybackSource {
  /** `null` — играть нечего вообще (ни локального файла, ни серверного адреса). */
  source: string | null;
  /** Правда — источник локальный (мгновенно, без спиннера загрузки). */
  isLocal: boolean;
}

/**
 * Чистый выбор источника по уже известным фактам: есть ли локальный
 * кандидат и существует ли он физически на диске.
 */
export function pickVoicePlaybackSource(input: {
  localUri: string | null;
  localFileExists: boolean;
  remoteUrl: string | null | undefined;
}): VoicePlaybackSource {
  if (input.localUri && input.localFileExists) return { source: input.localUri, isLocal: true };
  return { source: input.remoteUrl ?? null, isLocal: false };
}

/**
 * Обёртка с реальной (асинхронной) проверкой существования файла —
 * единственное несинхронное звено; сам выбор источника делегирован чистой
 * `pickVoicePlaybackSource` выше.
 */
export async function resolveVoicePlaybackSource(
  remoteUrl: string | null | undefined,
  localUri: string | null,
  fileExists: (uri: string) => Promise<boolean>,
): Promise<VoicePlaybackSource> {
  const localFileExists = localUri ? await fileExists(localUri).catch(() => false) : false;
  return pickVoicePlaybackSource({ localUri, localFileExists, remoteUrl });
}
