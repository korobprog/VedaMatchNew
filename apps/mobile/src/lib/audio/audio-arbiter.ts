/**
 * Кто кому уступает звук внутри приложения (VED-331).
 *
 * Между приложениями звук делит аудиофокус Android, и `expo-audio` его
 * берёт. Но фокус у `expo-audio` один на модуль: голосовое, рингтон и
 * Медиатека для системы — один и тот же владелец, и друг у друга фокус не
 * отнимают. Без договорённости внутри приложения голосовое заиграло бы
 * поверх киртана, а рингтон входящего — поверх лекции.
 *
 * Договорённость — здесь: источник звука объявляет, что начал, остальные
 * по таблице решают, уступать ли. Таблица — чистая функция, её и проверяет
 * тест; сам модуль — синглтон со списком слушателей, как реестр голосовых
 * (`voice-playback-registry.ts`), потому что источники живут в разных местах
 * дерева и друг друга не видят.
 *
 * Звонок (`InCallManager`) сюда не входит: он берёт системный фокус
 * отдельным модулем, и Медиатека уступает ему по-честному, через Android.
 * Звонок, пока он лишь звенит, Медиатека видит по фазе звонка
 * (`media-interruption.ts`) — рингтон сам объявляет о себе здесь же.
 */
export type AudioOwner = 'media' | 'voice' | 'recording' | 'ringtone';

/**
 * Уступает ли `listener`, когда начал звучать `starter`. Сам себе никто не
 * уступает: новое голосовое останавливает прежнее своим реестром, а не
 * через эту таблицу.
 *
 * - Медиатека молчит, пока играет голосовое, пишется голосовое или звенит
 *   звонок: человек сам выбрал слушать сообщение, а звонок важнее музыки.
 * - Голосовое останавливается, когда человек включил запись в Медиатеке.
 * - Рингтон никому не уступает: звонок решает, когда ему замолчать.
 */
export function yieldsTo(listener: AudioOwner, starter: AudioOwner): boolean {
  if (listener === starter) return false;
  switch (listener) {
    case 'media':
      return starter === 'voice' || starter === 'recording' || starter === 'ringtone';
    case 'voice':
      return starter === 'media' || starter === 'recording' || starter === 'ringtone';
    case 'recording':
    case 'ringtone':
      return false;
  }
}

type Listener = (starter: AudioOwner) => void;

const listeners = new Map<AudioOwner, Set<Listener>>();

/**
 * Источник звука начинает играть. Все, кто по таблице уступает, узнают об
 * этом синхронно — до того, как новый звук успеет прозвучать.
 */
export function announceAudioStart(starter: AudioOwner): void {
  for (const [owner, set] of listeners) {
    if (!yieldsTo(owner, starter)) continue;
    for (const listener of [...set]) {
      try {
        listener(starter);
      } catch {
        // Один сломанный слушатель не должен оставить звучать остальных.
      }
    }
  }
}

/** Подписка источника `owner` на «кто-то начал». Возвращает отписку. */
export function onYield(owner: AudioOwner, listener: Listener): () => void {
  let set = listeners.get(owner);
  if (!set) {
    set = new Set();
    listeners.set(owner, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

/** Только для тестов: синглтон переживает между ними. */
export function resetAudioArbiterForTests(): void {
  listeners.clear();
}
