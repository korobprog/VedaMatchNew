import * as SecureStore from 'expo-secure-store';
import { DEFAULT_VOICE_SPEED, parseVoiceSpeed, VOICE_SPEED_STORAGE_KEY, type VoiceSpeed } from './voice-speed';

/**
 * Хранилище выбранной скорости — обёртка над `expo-secure-store`, аналог
 * внешнего хранилища сайта поверх `localStorage`
 * (`apps/web/src/components/chat/chat-voice-player.tsx`). Не покрыто
 * тестами намеренно: чистая логика цикла/разбора уже проверена в
 * `voice-speed.spec.ts`, здесь — только ввод-вывод и подписка.
 *
 * Кэш в памяти нужен по двум причинам: чтение из Keystore асинхронно, а
 * первый рендер плеера должен получить значение синхронно (без мигания
 * 1× → сохранённая скорость), и второй плеер, открытый следом за первым, не
 * должен заново идти в хранилище ради того же числа.
 */
let cached: VoiceSpeed | null = null;
let loadPromise: Promise<VoiceSpeed> | null = null;
const listeners = new Set<() => void>();

export function getCachedVoiceSpeed(): VoiceSpeed {
  return cached ?? DEFAULT_VOICE_SPEED;
}

export async function loadVoiceSpeed(): Promise<VoiceSpeed> {
  if (cached !== null) return cached;
  if (!loadPromise) {
    loadPromise = SecureStore.getItemAsync(VOICE_SPEED_STORAGE_KEY)
      .then((raw) => {
        cached = parseVoiceSpeed(raw);
        return cached;
      })
      .catch(() => {
        cached = DEFAULT_VOICE_SPEED;
        return cached;
      });
  }
  return loadPromise;
}

export async function setVoiceSpeed(speed: VoiceSpeed): Promise<void> {
  cached = speed;
  listeners.forEach((listener) => listener());
  try {
    await SecureStore.setItemAsync(VOICE_SPEED_STORAGE_KEY, String(speed));
  } catch {
    // Останется верной для этого запуска приложения, не переживёт перезапуск —
    // не повод не переключить звук прямо сейчас.
  }
}

/** Плеер подписывается, чтобы смена скорости на одном пузыре сразу применилась ко всем открытым. */
export function subscribeVoiceSpeed(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
