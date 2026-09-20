/**
 * Реестр локальных файлов своих только что записанных голосовых (VED-290).
 *
 * Проблема, которую решает модуль: голосовое, которое человек только что
 * записал и отправил, уже лежит байт-в-байт на диске (файл рекордера,
 * `voice-recorder-control.tsx`) — но плеер в собственном пузыре до сих пор
 * playbook брал тот же файл по URL с сервера, и пока сеть не прогрузит
 * заново то, что и так есть локально, крутился спиннер.
 *
 * Ключ реестра — «канонический» URL вложения (`canonicalVoiceUrlKey`), не
 * id сообщения/вложения: сервер отдаёт голосовые из закрытого бакета по
 * подписанной ссылке (`chat-uploads.service.ts: signPublicUrl`), и подпись
 * (`?X-Amz-...`) у одного и того же файла каждый раз разная — при ответе на
 * загрузку (`RawStorageUrls`, без подписи) и при чтении сообщения из ленты
 * (с подписью). Путь до объекта в бакете при этом неизменен, поэтому обрезка
 * query — единственное надёжное сопоставление «оптимистичный пузырь →
 * settled-сообщение с того же сервера» без похода в API за стабильным id.
 *
 * Хранилище — только в памяти процесса, не персистентное: это и есть нужное
 * поведение по ТЗ («после перезапуска приложения — локального файла уже
 * нет», плеер должен упасть на сетевой URL). Специально ничего не сохраняем
 * в AsyncStorage ради этого.
 */

export interface VoiceCacheEntry {
  /** Канонический URL — см. `canonicalVoiceUrlKey`. */
  key: string;
  /** `file://…` — путь рекордера, откуда можно проиграть без сети. */
  localUri: string;
  sizeBytes: number;
  createdAt: number;
}

export interface VoiceCachePolicy {
  /** Сколько локальных файлов держим одновременно — больше ни к чему: это
   *  подстраховка на случай «отправил и сразу слушаю», не архив переписки. */
  maxEntries: number;
  /** Суммарный размер. При 64 кбит/с и потолке записи в 600 с (`VOICE_RECORD_MAX_SECONDS`)
   *  одно голосовое — до ~4.8 МБ; лимит покрывает несколько таких разом, не
   *  давая кэшу расти без края при активной переписке. */
  maxTotalBytes: number;
  /** Старше суток ценность локальной копии не отличается от похода на сервер —
   *  человек и так почти наверняка ушёл из этой переписки, а место на диске
   *  реальное. */
  maxAgeMs: number;
}

export const VOICE_CACHE_POLICY: VoiceCachePolicy = {
  maxEntries: 40,
  maxTotalBytes: 40 * 1024 * 1024,
  maxAgeMs: 24 * 60 * 60 * 1000,
};

/** Убирает подпись/query у ссылки на файл переписки — см. пояснение модуля. `null`, если ссылки нет вовсе. */
export function canonicalVoiceUrlKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const withoutQuery = url.split('?')[0].split('#')[0];
  return withoutQuery || null;
}

/**
 * Кто вылетает из кэша, чтобы уложиться в политику. Чистая функция: не
 * трогает диск сама, только считает план — реальное удаление файлов делает
 * вызывающая сторона (у неё есть `expo-file-system`, здесь его нарочно нет,
 * чтобы функция оставалась тестируемой без мока файловой системы).
 *
 * Порядок вытеснения — от старых к новым (`createdAt`): человек скорее
 * переслушает то, что записал минуту назад, чем то, что час назад.
 * Просроченные по возрасту вылетают в любом случае, даже если лимиты по
 * числу/размеру не превышены.
 */
export function planVoiceCacheEviction(
  entries: readonly VoiceCacheEntry[],
  policy: VoiceCachePolicy,
  now: number,
): string[] {
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const evicted = new Set<string>();

  for (const entry of sorted) {
    if (now - entry.createdAt > policy.maxAgeMs) evicted.add(entry.key);
  }

  const kept = () => sorted.filter((entry) => !evicted.has(entry.key));

  for (const entry of kept()) {
    if (kept().length <= policy.maxEntries) break;
    evicted.add(entry.key);
  }

  let total = kept().reduce((sum, entry) => sum + entry.sizeBytes, 0);
  for (const entry of kept()) {
    if (total <= policy.maxTotalBytes) break;
    evicted.add(entry.key);
    total -= entry.sizeBytes;
  }

  return sorted.filter((entry) => evicted.has(entry.key)).map((entry) => entry.key);
}

// ===== Стейтфул-обёртка: реестр текущей сессии =====

const entries = new Map<string, VoiceCacheEntry>();

/**
 * Вызывать сразу после успешной отправки голосового (`voice-recorder-control.tsx`),
 * пока локальный файл ещё не тронут. Возвращает список вытесненных записей —
 * их файлы обязана удалить с диска вызывающая сторона.
 */
export function registerLocalVoiceFile(
  url: string | null | undefined,
  localUri: string,
  sizeBytes: number,
  now: number = Date.now(),
): VoiceCacheEntry[] {
  const key = canonicalVoiceUrlKey(url);
  if (!key) return [];
  entries.set(key, { key, localUri, sizeBytes, createdAt: now });
  const evictedKeys = planVoiceCacheEviction(Array.from(entries.values()), VOICE_CACHE_POLICY, now);
  const evicted = evictedKeys.map((evictedKey) => entries.get(evictedKey)).filter((entry): entry is VoiceCacheEntry => Boolean(entry));
  for (const evictedKey of evictedKeys) entries.delete(evictedKey);
  return evicted;
}

/** `null` — локальной копии нет, плеер обязан взять `url` с сервера. */
export function getLocalVoiceFile(url: string | null | undefined): string | null {
  const key = canonicalVoiceUrlKey(url);
  if (!key) return null;
  return entries.get(key)?.localUri ?? null;
}

/** Плеер вызывает, обнаружив, что файл из реестра физически пропал (`FileSystem.getInfoAsync` вернул `exists: false`) —
 *  без этого следующая попытка снова наткнулась бы на тот же мёртвый путь. */
export function forgetLocalVoiceFile(url: string | null | undefined): void {
  const key = canonicalVoiceUrlKey(url);
  if (key) entries.delete(key);
}

/** Только для тестов — синглтон переживает между ними. */
export function resetVoiceLocalFileCacheForTests(): void {
  entries.clear();
}
