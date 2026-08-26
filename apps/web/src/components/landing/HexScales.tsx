"use client";

import { useEffect, useRef } from "react";
import {
  blendStops,
  extrudedWalls,
  hexCenters,
  hexCorners,
  lightFalloff,
  parseHexColor,
  shimmer,
} from "@/lib/hex-scales";

/**
 * Гексагональная «чешуя» фона: соты с фаской, по которым ползёт блик, а под
 * курсором зажигается свет. Объём даёт не перспектива, а освещение граней:
 * ближняя к свету сторона соты светлее, дальняя темнее — так же читается
 * настоящая скошенная пластина. Плюс поле сдвигается за курсором, и разница
 * хода фона и содержимого достраивает глубину.
 *
 * Канвас 2D, а не WebGL: рисунок плоский, шейдер здесь ничего не добавил бы,
 * зато потянул бы контекст, который на слабом телефоне отбирают первым.
 *
 * Цвета читаются из токенов темы и перечитываются при её переключении:
 * зашитый `#RRGGBB` пережил бы смену темы и остался бы от чужой.
 */

/**
 * Радиус плитки в CSS-пикселях. На десктопе крупные: мелкая сетка читается
 * как узор на обоях, а объём виден только когда торец соизмерим с плиткой.
 * На телефоне втрое мельче — там в ширину экрана влезает от силы три
 * крупные соты, и вместо чешуи получаются три пятна.
 */
const HEX_RADIUS_DESKTOP = 132;
const HEX_RADIUS_MOBILE = 44;

/** Граница, с которой считаем экран телефоном. Совпадает с брейкпоинтом md. */
const MOBILE_MAX_WIDTH = 768;

/** Зазор между плитками — щель, сквозь которую видно фон под чешуёй. */
const HEX_GAP_RATIO = 2 / 132;

/** Высота, на которую плитка приподнята над фоном: толщина торца. */
const DEPTH_RATIO = 22 / 132;

/** Радиус пятна прижима — во сколько радиусов плитки он укладывается. */
const LIGHT_RADIUS_RATIO = 420 / 132;

/**
 * Радиус, внутри которого направление торца перестаёт зависеть от точки
 * прижима, — тоже в долях плитки, иначе на телефоне «спокойная» зона
 * накрывала бы пол-экрана.
 */
const DIRECTION_STABLE_RATIO = 260 / 132;

function hexRadius(width: number): number {
  return width < MOBILE_MAX_WIDTH ? HEX_RADIUS_MOBILE : HEX_RADIUS_DESKTOP;
}

/**
 * Насколько курсор придавливает плитки. `1` — под самым курсором чешуя
 * ложится вровень с фоном и поднимается обратно к краям пятна света.
 * Это и есть «рука ведёт по чешуе»: узор отзывается на движение, а заодно
 * сам успокаивается там, куда человек смотрит, — и не мешает тексту.
 */
const PRESS = 1;

/**
 * Кадр не режем: плиток крупных всего несколько десятков, а движение
 * привязано к руке — на половинной частоте оно заметно рвётся под курсором.
 * Экономия здесь идёт не на частоте, а на числе плиток.
 */
const FRAME_INTERVAL_MS = 0;

/** Токены-акценты, между которыми переливается чешуя. */
const ACCENT_TOKENS = ["--vm-magenta", "--vm-cyan", "--vm-gold"] as const;

/** Больше двух — и канвас начинает стоить дороже всего остального фона. */
const MAX_PIXEL_RATIO = 2;

/** На сколько пикселей поле уезжает за курсором от края до края экрана. */
const PARALLAX_PX = 26;

/**
 * Насколько ракурс уводит торец в сторону от курсора. Единица — торец
 * смотрит строго от света; меньше — плитки выглядят приподнятыми почти
 * отвесно, и объём пропадает.
 */
const TILT = 0.9;

/**
 * Доля, на которую свет догоняет курсор за кадр при 60 Гц. Мгновенное
 * следование выглядит дёрганым: поле должно нагонять руку, а не прилипать.
 */
const EASE = 0.06;

/**
 * Насколько прижим уезжает навстречу пролистыванию. На телефоне курсора
 * нет, и отзываться чешуе не на что, — роль руки играет скролл: чем резче
 * листают, тем дальше от центра уходит прижатая полоса.
 */
const SCROLL_PRESS = 4;

/** Доля, на которую прижим возвращается к центру за кадр после скролла. */
const SCROLL_RETURN = 0.04;

/**
 * Насколько шире становится пятно прижима на быстром пролистывании.
 * Одного сдвига полосы мало: за короткий флик она не успевает уехать
 * далеко, а вот расширение видно сразу.
 */
const SCROLL_SPREAD = 0.9;

/** Пролистывание за кадр, на котором расширение выходит на максимум. */
const SCROLL_FULL_DELTA = 90;

/** Доля, на которую расширение спадает за кадр, когда листать перестали. */
const SCROLL_SPREAD_DECAY = 0.06;

/** Цвет затенённой грани. Канвас принимает любую строку CSS-цвета, поэтому
 *  токен уходит в strokeStyle как есть — разбирать rgba() незачем. */
const SHADOW_TOKEN = "--vm-hex-shadow";

/** Доля непрозрачности освещённой грани; на светлой теме заметно ниже. */
const LIT_TOKEN = "--vm-hex-lit";

/** Подложка лица плитки — то, что поднимает её над фоном. */
const FACE_TOKEN = "--vm-hex-face";

/** Запасная тень, если токен не прочитался: лучше блёклая фаска, чем никакой. */
const SHADOW_FALLBACK = "rgba(0, 0, 0, 0.3)";

function readAccents(): Array<[number, number, number]> {
  const styles = getComputedStyle(document.documentElement);
  return ACCENT_TOKENS.map((token) =>
    parseHexColor(styles.getPropertyValue(token)),
  ).filter((rgb): rgb is [number, number, number] => rgb !== null);
}

function readLit(): number {
  const value = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(LIT_TOKEN),
  );
  return Number.isFinite(value) ? value : 0.4;
}

function readShadow(): string {
  return readColorToken(SHADOW_TOKEN, SHADOW_FALLBACK);
}

function readFace(): string {
  return readColorToken(FACE_TOKEN, "rgba(255, 255, 255, 0.04)");
}

function readColorToken(token: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  return value || fallback;
}

export function HexScales({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // Тонкий указатель — мышь или перо. На тапе «следование за курсором»
    // означало бы, что свет замирает там, где человек последний раз ткнул.
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    let accents = readAccents();
    let shadow = readShadow();
    let lit = readLit();
    let face = readFace();
    // Токены не прочитались — рисовать нечем, и лучше пустой фон, чем
    // чешуя цвета по умолчанию поверх чужой темы.
    if (accents.length === 0) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let lastDrawnAt = -Infinity;
    let visible = true;

    // Куда тянется свет и где он сейчас. Пока мышь не двигали — центр экрана,
    // тогда чешуя освещена ровно и не выглядит наполовину погасшей.
    let targetX = 0;
    let targetY = 0;
    // 0..1 — насколько сильно сейчас листают; расширяет пятно прижима.
    let spread = 0;
    let lightX = 0;
    let lightY = 0;

    function draw(seconds: number) {
      if (!context) return;
      context.clearRect(0, 0, width, height);

      // Сдвиг поля за курсором. Крайние плитки уже нарисованы за границей
      // экрана (hexCenters берёт ряд с запасом), поэтому просветов не будет.
      const parallaxX = ((lightX / width) * 2 - 1) * PARALLAX_PX;
      const parallaxY = ((lightY / height) * 2 - 1) * PARALLAX_PX;

      // Порядок отрисовки — сверху вниз и слева направо, и он не зависит от
      // курсора: сортировка вслед за мышью заставляла соседние плитки
      // меняться местами по глубине, и чешуя щёлкала при проходе руки.
      const radius = hexRadius(width);
      const gap = radius * HEX_GAP_RATIO;
      const lightRadius =
        radius * LIGHT_RADIUS_RATIO * (1 + spread * SCROLL_SPREAD);
      const directionStable = radius * DIRECTION_STABLE_RATIO;
      const cells = hexCenters(width, height, radius).sort(
        (a, b) => a.y - b.y || a.x - b.x,
      );

      for (const cell of cells) {
        const x = cell.x + parallaxX;
        const y = cell.y + parallaxY;

        const wave = shimmer(cell.x, cell.y, seconds);
        const glow = lightFalloff(x - lightX, y - lightY, lightRadius);
        // Придавленная плитка не бликует: level ведём от волны, а свечение
        // под курсором отдаём «прижиму», а не яркости.
        const level = Math.min(1, wave * 0.85 * (1 - glow * 0.7));

        // Торец уходит от света: чем дальше плитка от курсора, тем сильнее
        // она развёрнута — так же ведёт себя настоящая плоскость под углом.
        // Вблизи курсора направление подмешиваем к общему наклону поля,
        // иначе у плитки под мышью оно скачет на каждом кадре.
        const rawX = x - lightX;
        const rawY = y - lightY;
        const distance = Math.hypot(rawX, rawY);
        const near = Math.min(1, distance / directionStable);
        const dirX = rawX * near + (x - width / 2) * (1 - near);
        const dirY = rawY * near + (y - height / 2) * (1 - near);
        const length = Math.hypot(dirX, dirY) || 1;
        // Разная высота плиток: одинаковые торцы читаются как печать по
        // трафарету, а не как набранная руками чешуя. Под курсором высота
        // уходит в ноль — плитка придавлена.
        const depth =
          radius * DEPTH_RATIO * (0.55 + wave * 0.75) * (1 - glow * PRESS);
        const ox = (dirX / length) * depth * TILT;
        const oy = (dirY / length) * depth * TILT;

        const corners = hexCorners(x, y, radius - gap);

        // Торец
        context.fillStyle = shadow;
        for (const wall of extrudedWalls(corners, x, y, ox, oy)) {
          context.beginPath();
          context.moveTo(wall[0].x, wall[0].y);
          for (let i = 1; i < wall.length; i += 1) {
            context.lineTo(wall[i].x, wall[i].y);
          }
          context.closePath();
          context.fill();
        }

        // Лицо плитки
        context.beginPath();
        context.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i += 1) {
          context.lineTo(corners[i].x, corners[i].y);
        }
        context.closePath();

        // Сначала ровная подложка — она и делает плитку плиткой, а не
        // подсвеченным контуром; поверх ложится акцент блика.
        context.fillStyle = face;
        context.fill();

        const [r, g, b] = blendStops(accents, level);
        // Кубическая кривая оставляет светящимися немногие плитки: линейная
        // подсвечивала половину чешуи разом, и блик переставал читаться.
        const tint = 0.02 + level * level * level * 0.2;
        context.fillStyle = `rgba(${r}, ${g}, ${b}, ${tint})`;
        context.fill();

        // Кромка со стороны света — тонкий блик по верхнему ребру плитки.
        context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${lit * (1 - glow)})`;
        context.lineWidth = 1;
        context.stroke();
      }
    }

    function resize() {
      if (!canvas || !context) return;
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      // Свет ещё не сдвигали — держим его в центре нового размера.
      if (targetX === 0 && targetY === 0) {
        targetX = width / 2;
        targetY = height / 2;
        lightX = targetX;
        lightY = targetY;
      }
      // Перерисовываем сразу: до следующего кадра холст растянут и пуст.
      draw(reduceMotion ? 0 : performance.now() / 1000);
    }

    function tick(now: number) {
      frame = window.requestAnimationFrame(tick);
      if (!visible) return;
      if (now - lastDrawnAt < FRAME_INTERVAL_MS) return;
      lastDrawnAt = now;
      // Без курсора прижим держится только скроллом, поэтому между
      // пролистываниями он сам расходится к центру — иначе полоса
      // застывала бы там, где человек остановил палец.
      if (!finePointer) {
        targetY += (height / 2 - targetY) * SCROLL_RETURN;
        spread = Math.max(0, spread - SCROLL_SPREAD_DECAY);
      }
      lightX += (targetX - lightX) * EASE;
      lightY += (targetY - lightY) * EASE;
      draw(now / 1000);
    }

    function onPointerMove(event: PointerEvent) {
      targetX = event.clientX;
      targetY = event.clientY;
    }

    let lastScrollY = window.scrollY;

    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastScrollY;
      lastScrollY = y;
      // Прижатая полоса уезжает навстречу пролистыванию и сама возвращается
      // к центру в tick(), когда листать перестали.
      targetX = width / 2;
      targetY = Math.min(
        height,
        Math.max(0, height / 2 - delta * SCROLL_PRESS),
      );
      spread = Math.min(1, Math.abs(delta) / SCROLL_FULL_DELTA);
    }

    function onVisibility() {
      visible = document.visibilityState === "visible";
    }

    // Смена темы меняет значения токенов — цвета нужно перечитать, иначе
    // чешуя останется в акцентах прошлой темы до перезагрузки страницы.
    const themeObserver = new MutationObserver(() => {
      const next = readAccents();
      if (next.length > 0) accents = next;
      shadow = readShadow();
      lit = readLit();
      face = readFace();
      if (reduceMotion) draw(0);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);

    // prefers-reduced-motion оставляет один статичный кадр: и ползущий блик,
    // и поле, едущее за рукой, — ровно то движение, ради которого настройку
    // включают.
    if (!reduceMotion) {
      if (finePointer) {
        window.addEventListener("pointermove", onPointerMove, {
          passive: true,
        });
      } else {
        window.addEventListener("scroll", onScroll, { passive: true });
      }
      frame = window.requestAnimationFrame(tick);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      themeObserver.disconnect();
    };
  }, []);

  return (
    // z-0, а не отрицательный: обёртка лендинга красит себя непрозрачным
    // bg-bg-0, а её фон в порядке отрисовки идёт после потомков с
    // отрицательным z-index — такой слой закрашивается целиком. Нулевой
    // остаётся под содержимым: секции ниже по дереву и перекрывают его.
    <div
      aria-hidden
      className={`hex-layer pointer-events-none fixed inset-0 z-0 ${className ?? ""}`}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
