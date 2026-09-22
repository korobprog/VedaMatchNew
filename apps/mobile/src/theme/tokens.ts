/**
 * Токены дизайн-системы портала, перенесённые из `apps/web/src/app/globals.css`.
 *
 * Правило то же, что на сайте: цвет задаётся в обеих темах, хардкод `#RRGGBB`
 * в экранах запрещён. Значения скопированы один в один; при правке токена на
 * сайте его нужно поправить и здесь.
 */

export interface Palette {
  bg0: string;
  bg1: string;
  bg2: string;
  glass: string;
  glassBorder: string;
  sheet: string;
  sheetBorder: string;
  text0: string;
  text1: string;
  text2: string;
  magenta: string;
  cyan: string;
  gold: string;
  violet: string;
  blue: string;
  /** Текст поверх заливки `magenta`. */
  onAccent: string;
  /**
   * Три состояния ответа сканера: «подходит», «сомнительно», «не подходит»
   * (VED-335). Ими же красится рамка прицеливания камеры.
   *
   * Заведены отдельно от `cyan`/`gold`/`magenta`, хотя на глаз соседние: те
   * три — акценты бренда (ссылка, значок, кнопка), и их значения меняются
   * вместе с фирменным стилем. Эти — значение, а не украшение: зелёное тут
   * обязано остаться зелёным, даже если бренд завтра станет синим. Фирменные
   * для этой роли не годятся ещё и по замеру: `cyan` на светлой теме даёт
   * 4.53:1 на `bg0` и 4.16:1 на `bg1`, `gold` — 3.66:1 на `bg0`; оба ниже
   * порога мелким текстом (CLAUDE.md уже держит их в списке исключений).
   *
   * Цвет — не единственный носитель состояния: и рамка, и карточка вердикта
   * дублируют его словом и подписью для скринридера
   * (`components/wellness/aim-frame.tsx`, `lib/wellness/verdict-copy.ts`).
   * Замеры реальных пар — в `contrast.spec.ts`.
   */
  success: string;
  warning: string;
  danger: string;
  /** Подложка счётчиков непрочитанного, как `--vm-mint-from` на сайте. */
  mint: string;
  /** Текст поверх `mint`: 9,3:1 в обеих темах. */
  onMint: string;
  /**
   * Затемнение подложки под модальными листами/диалогами — как `bg-black/60`
   * на сайте (`donate-sheet.tsx`, `task-dialog.tsx` и другие модалки). На
   * сайте это не тема-зависимый CSS-токен, а буквальный класс Tailwind,
   * поэтому здесь заведён отдельно, но с тем же значением в обеих темах —
   * затемнение одинаково тёмное и на светлом, и на тёмном фоне.
   */
  scrim: string;
}

export const light: Palette = {
  bg0: '#FBF9FF',
  bg1: '#F3EEFC',
  bg2: '#EAE2F8',
  glass: 'rgba(255, 255, 255, 0.72)',
  glassBorder: 'rgba(74, 44, 122, 0.14)',
  sheet: 'rgba(255, 255, 255, 0.86)',
  sheetBorder: 'rgba(74, 44, 122, 0.16)',
  text0: '#180F2C',
  text1: '#4B3B6C',
  text2: '#766591',
  magenta: '#D71A80',
  cyan: '#0B826F',
  gold: '#B0770E',
  violet: '#7A3FBF',
  blue: '#1F5FBF',
  onAccent: '#FFFFFF',
  success: '#0A6E38',
  warning: '#8F5F00',
  danger: '#B81D1D',
  mint: '#33CCCC',
  onMint: '#14212C',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

export const dark: Palette = {
  bg0: '#0A0614',
  bg1: '#150C24',
  bg2: '#1B0F2E',
  glass: 'rgba(255, 255, 255, 0.06)',
  glassBorder: 'rgba(255, 255, 255, 0.12)',
  sheet: 'rgba(26, 16, 44, 0.84)',
  sheetBorder: 'rgba(255, 255, 255, 0.16)',
  text0: '#F6F1FF',
  text1: '#B8A9D9',
  text2: '#7F719E',
  magenta: '#FF3E9E',
  cyan: '#23F0C7',
  gold: '#FFC85C',
  violet: '#C68BFF',
  blue: '#7FB4FF',
  onAccent: '#180F2C',
  success: '#4BE08C',
  warning: '#FFC85C',
  danger: '#FF7A7A',
  mint: '#33CCCC',
  onMint: '#14212C',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

/** Имена начертаний, под которыми шрифты регистрируются в `useFonts`. */
export const fonts = {
  displayMedium: 'Unbounded_500Medium',
  displayBold: 'Unbounded_700Bold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  /** Цифры (время голосового и подобное) — как `--font-mono` на сайте: IBM Plex Mono, табличные цифры. */
  mono: 'IBMPlexMono_400Regular',
  monoSemiBold: 'IBMPlexMono_600SemiBold',
} as const;

export const radius = { sm: 12, md: 16 } as const;

/** Минимальная зона нажатия, как в макете: меньше 44 px не бывает. */
export const hitTarget = 44;
