import { cn } from "@/lib/utils";

/**
 * Курсор роликов на лендинге: пухлый и мятный. Обводка `--vm-on-mint` поверх
 * мятной заливки читается и на светлой теме, и на тёмной — мята одинакова в
 * обеих, поэтому цвет не приходится разводить по темам.
 *
 * Общий для макета портала и для колоды Знакомств: оба ролика живут в
 * `components/landing`, и второй такой же курсор рядом расходился бы с первым
 * при первой же правке формы.
 *
 * Позицию задаёт родитель — курсор рисуется от левого верхнего угла своего
 * контейнера, а ездит внешний слой с `transform`.
 */
export function TourCursor({ pressing }: { pressing: boolean }) {
  return (
    <span className="pointer-events-none absolute left-0 top-0">
      {/* Кольцо клика: расходится в момент нажатия и гаснет вместе с ним. */}
      <span
        className={cn(
          "absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-mint transition-all duration-200 ease-out",
          pressing ? "size-9 opacity-0" : "size-3 opacity-70",
        )}
      />
      <svg
        viewBox="0 0 24 24"
        className={cn(
          "relative size-6 transition-transform duration-150 ease-out",
          pressing && "scale-[0.82]",
        )}
        style={{ filter: "drop-shadow(0 3px 7px var(--vm-glow-mint))" }}
      >
        {/* Толстая обводка с круглыми стыками и даёт ту самую пухлость:
            один и тот же контур, обведённый по кругу, скругляет острые углы
            стрелки, не переписывая её путь. */}
        <path
          d="M6 3.4 L6 18.2 L9.9 14.6 L12.4 20.2 L15.2 19 L12.7 13.5 L18 13.1 Z"
          fill="var(--vm-mint-from)"
          stroke="var(--vm-on-mint)"
          strokeWidth="2.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          paintOrder="stroke"
        />
      </svg>
    </span>
  );
}

/**
 * То же самое, но пальцем: в макете телефона стрелка мыши читается как чужой
 * предмет — по телефону тапают. Кончик пальца сдвинут в точку нажатия, иначе
 * палец «жал» бы мимо кнопки на половину своей ширины.
 */
export function TourFinger({ pressing }: { pressing: boolean }) {
  return (
    <span className="pointer-events-none absolute left-0 top-0">
      <span
        className={cn(
          "absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-mint transition-all duration-200 ease-out",
          pressing ? "size-10 opacity-0" : "size-3.5 opacity-70",
        )}
      />
      <svg
        viewBox="0 0 24 24"
        className={cn(
          "relative size-7 origin-top transition-transform duration-150 ease-out",
          // Нажатие проседает к кончику: палец не уменьшается целиком, он
          // прижимается — origin-top держит кончик на месте.
          pressing && "scale-[0.88]",
        )}
        style={{
          filter: "drop-shadow(0 3px 7px var(--vm-glow-mint))",
          // Кончик указательного пальца в этой фигуре — примерно (11.5, 3)
          // из 24; сдвигаем на него, чтобы он лёг ровно в центр кнопки.
          transform: "translate(-13px, -4px)",
        }}
      >
        <path
          d="M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"
          fill="var(--vm-mint-from)"
          stroke="var(--vm-on-mint)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          paintOrder="stroke"
        />
      </svg>
    </span>
  );
}
