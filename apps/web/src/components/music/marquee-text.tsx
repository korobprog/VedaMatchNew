"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Строка, которая едет титрами, когда не помещается.
 *
 * Полоса плеера узкая по устройству, и длинное название обрывалось на
 * «Мир Прокисший (Prod. by…» — а узнать запись человек хочет ровно тогда,
 * когда она уже играет.
 *
 * Едет **только если не помещается**: короткое название, дёргающееся без
 * причины, читается хуже неподвижного. Поэтому ширина меряется, а не
 * угадывается по числу знаков — в «Шри Гуру-вандана» и «WWWWWWWWWWWWWWWW»
 * знаков поровну, а места они занимают вдвое разное.
 *
 * Под `prefers-reduced-motion` бега нет вовсе, и вторая копия текста не
 * рисуется: обычное многоточие. Обезвредить одну анимацию мало — две копии
 * подряд без движения выглядят как ошибка вёрстки.
 */

/** Скорость бега. Медленнее — не дочитать за проход, быстрее — не успеть. */
const PIXELS_PER_SECOND = 28;

/** Просвет между копиями, чтобы конец не слипался с началом. */
const GAP_REM = 2.5;

/** Короткой строке незачем нестись: ниже этого времени бег выглядит рывком. */
const MIN_DURATION_SECONDS = 6;

export function MusicMarqueeText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const boxRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  /** `null` — помещается или человек просил не двигать. */
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

    const measure = () => {
      const inner = textRef.current;
      if (!inner || !boxRef.current) return;

      if (calm.matches) {
        setDuration(null);
        return;
      }

      // В бегущем режиме у копии есть отступ справа, в обычном — нет.
      // Считать надо по голому тексту: иначе, когда окно расширят и текст
      // начнёт помещаться, отступ продолжит перевешивать, и строка застрянет
      // в беге навсегда.
      const padRight = parseFloat(getComputedStyle(inner).paddingRight) || 0;
      const textWidth = inner.scrollWidth - padRight;

      const overflow = textWidth - boxRef.current.clientWidth;
      // Запас в пиксель: округление ширин иногда даёт лишнюю долю, и без
      // него строка, помещающаяся ровно, начинала ехать.
      if (overflow <= 1) {
        setDuration(null);
        return;
      }

      // Шаг повтора — текст вместе с зазором: за это расстояние вторая копия
      // встаёт на место первой.
      const rem =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const step = textWidth + GAP_REM * rem;
      setDuration(Math.max(MIN_DURATION_SECONDS, step / PIXELS_PER_SECOND));
    };

    /* Первый замер — сразу, а не с наблюдателя.
       `ResizeObserver` доставляет отчёт в шаге отрисовки, а скрытая вкладка
       его не делает: на фоновой вкладке строка так и осталась бы обрезанной
       до первого изменения размера. Проверено — при скрытом документе
       наблюдатель не срабатывает ни разу. */
    measure();

    // Полоса меняет ширину при повороте телефона и при появлении соседних
    // кнопок — без наблюдателя строка застревала бы в решении, принятом на
    // прошлой раскладке.
    const observer = new ResizeObserver(measure);
    observer.observe(box);

    // Человек может включить «меньше движения» и не перезагружать страницу.
    calm.addEventListener("change", measure);

    return () => {
      observer.disconnect();
      calm.removeEventListener("change", measure);
    };
  }, [text]);

  if (duration === null) {
    return (
      <span ref={boxRef} className={`block overflow-hidden ${className}`}>
        <span ref={textRef} className="block truncate">
          {text}
        </span>
      </span>
    );
  }

  return (
    <span
      ref={boxRef}
      className={`block overflow-hidden ${className}`}
      // Края растворяются, а не режутся: строка на ходу должна выглядеть
      // продолжающейся, а не упирающейся в невидимую стену.
      style={{
        maskImage:
          "linear-gradient(to right, transparent 0, black 10px, black calc(100% - 10px), transparent 100%)",
      }}
    >
      {/* Зазор — внутри каждой копии, а не между ними.
          С `gap` шаг повтора равен «текст + зазор», а сдвиг на −50% даёт
          «текст + половина зазора»: каждый круг строка дёргалась бы на
          недостающую половину. С отступом справа половина дорожки ровно
          равна шагу повтора, и шов сходится. Замерено. */}
      <span
        className="music-marquee-track flex w-max"
        style={
          { "--music-marquee-duration": `${duration}s` } as React.CSSProperties
        }
      >
        <span
          ref={textRef}
          className="whitespace-nowrap"
          style={{ paddingRight: `${GAP_REM}rem` }}
        >
          {text}
        </span>
        {/* Вторая копия — только для шва: читалке она не нужна, а вслух
            название дважды подряд звучит как заикание. */}
        <span
          aria-hidden="true"
          className="whitespace-nowrap"
          style={{ paddingRight: `${GAP_REM}rem` }}
        >
          {text}
        </span>
      </span>
    </span>
  );
}
