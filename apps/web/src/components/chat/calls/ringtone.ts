"use client";

/**
 * Гудки без аудиофайла: два тона через WebAudio. Входящему — двойной
 * сигнал с паузой, исходящему — длинный гудок раз в четыре секунды.
 *
 * Автовоспроизведение браузер может запретить, пока человек не
 * взаимодействовал со страницей: тогда `AudioContext` остаётся
 * приостановленным, и звук не пойдёт. Это не ошибка — баннер входящего
 * всё равно на экране; при первом жесте контекст возобновится.
 */
export type RingtoneKind = "incoming" | "outgoing";

export function startRingtone(kind: RingtoneKind): () => void {
  if (typeof window === "undefined" || !("AudioContext" in window)) return () => {};
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches && kind === "outgoing")
    // Тихий исходящий: при сниженной анимации не навязываем и звук ожидания.
    return () => {};

  const ctx = new AudioContext();
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.connect(ctx.destination);

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const beep = (freq: number, at: number, durationMs: number) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    const t = ctx.currentTime + at / 1000;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    gain.gain.setValueAtTime(0.12, t + durationMs / 1000 - 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
    osc.start(t);
    osc.stop(t + durationMs / 1000 + 0.01);
  };

  const cycle = () => {
    if (stopped) return;
    void ctx.resume().catch(() => undefined);
    if (kind === "incoming") {
      beep(880, 0, 220);
      beep(660, 300, 220);
      timer = setTimeout(cycle, 2200);
    } else {
      beep(425, 0, 1000);
      timer = setTimeout(cycle, 4000);
    }
  };
  cycle();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    void ctx.close().catch(() => undefined);
  };
}
