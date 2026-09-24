"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import Link from "next/link";
import {
  Bookmark,
  Bot,
  Calculator,
  CalendarDays,
  Check,
  CirclePlay,
  Columns2,
  HeartHandshake,
  History,
  Images,
  Info,
  Mail,
  Menu,
  PanelTop,
  Quote,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  donateTileView,
  loadDonationSettings,
  useDonationSettings,
} from "@/lib/donation-settings";
import { DonateButton } from "@/components/donate-sheet";
import { BookmarksSheet } from "@/components/bookmarks/bookmarks-sheet";
import { ServiceIcon } from "@/components/icons/service-icons";
import {
  useServiceCatalog,
  useServiceNames,
} from "@/components/service-catalog-provider";
import { CalculatorPad } from "./calculator-pad";
import { HistorySheet } from "./history-sheet";
import { FittedLabel } from "./fitted-label";
import {
  inviteCopyLabel,
  useInviteCopy,
  usePlayerHotkey,
  usePortalWindowSwitch,
} from "./quick-action-hooks";
import {
  DEFAULT_HEADER_ITEMS,
  HEADER_AVATAR_ID,
  HEADER_BELL_ID,
  HEADER_HOTKEYS_ID,
  HEADER_TOOLBAR_STORAGE_KEY,
  MAX_HEADER_BUTTONS,
  headerCatalog,
  headerToggleBlock,
  headerToggleNote,
  isHeaderFixed,
  moveHeaderItem,
  parseHeaderToolbar,
  resolveHeaderToolbar,
  serializeHeaderToolbar,
  toggleHeaderItem,
} from "./header-toolbar";
import { TuneRow } from "./tune-row";
import {
  BUILTIN_QUICK_ACTIONS,
  CUSTOM_ACTION_PREFIX,
  REQUIRED_QUICK_ACTIONS,
  addCustomQuickAction,
  arrangeQuickActions,
  customQuickActionId,
  lockedQuickActions,
  moveQuickAction,
  parseQuickConfig,
  quickActionCatalog,
  quickActionMeta,
  removeCustomQuickAction,
  serializeQuickConfig,
  serviceActionSlug,
  serviceQuickActions,
  toggleQuickAction,
  type BuiltinQuickActionId,
  type QuickActionId,
  type QuickActionMeta,
  type QuickConfig,
} from "./quick-actions";

/** Раскладка панели живёт на устройстве — см. комментарий в quick-actions.ts. */
export const QUICK_PANEL_STORAGE_KEY = "vedamatch:quick-panel";
const STORAGE_KEY = QUICK_PANEL_STORAGE_KEY;

/*
 * Про цвет мелких подписей внутри панели и её шторок.
 *
 * Панель лежит на сплошном `--vm-bg-1`: под ней не затемнение, а сама
 * страница (см. комментарий у контейнера ниже). `--vm-text-2` подобран под
 * `--vm-bg-0` и даёт там ровно 4,54:1; на более светлом `--vm-bg-1` тёмной
 * темы остаётся 4,29:1 — ниже порога AA для одиннадцати пикселей. Поэтому
 * подписи, объяснения и заголовки разделов здесь идут `--vm-text-1`
 * (замерено поверх фактической подложки, как велит «Дизайн-система» в
 * CLAUDE.md). `--vm-text-2` остаётся на значках: им достаточно 3:1.
 */

const ICONS: Record<
  BuiltinQuickActionId,
  React.ComponentType<{ className?: string }>
> = {
  // VED-402: те же три полоски, что были у бургера в шапке, — по ним меню
  // и ищут.
  menu: Menu,
  window: Columns2,
  bookmarks: Bookmark,
  history: History,
  // VED-416: кружок «пуск», а не нота — нота уже у Медиатеки в сервисах.
  player: CirclePlay,
  search: Search,
  assistant: Bot,
  aphorism: Quote,
  // VED-326: конверт, а не картинка. Стопка картинок уже занята «Картинками»
  // рядом, а открытку в жизни узнают по тому, что её посылают.
  postcard: Mail,
  // VED-326: «искры» открывают саму панель, и вторая такая же кнопка внутри
  // читалась как «то же самое ещё раз».
  collections: Images,
  calendar: CalendarDays,
  calculator: Calculator,
  invite: Share2,
  donate: HeartHandshake,
  info: Info,
  // VED-326: спасательный круг ничего не говорил про людей на том конце.
  support: Users,
};

/**
 * Один размер значка на все плитки (VED-326). Значки у lucide и у сервисов
 * нарисованы в разных сетках, и одинаковый `size-5` давал разную видимую
 * величину — равняемся по самому крупному.
 */
const TILE_ICON = "size-6";

/** Кнопки, которые открывают шторку под плитками, а не уводят со страницы. */
export type QuickSheetId =
  | "calculator"
  | "info"
  | "calendar"
  | "bookmarks"
  | "history";

const SHEET_TITLES: Record<QuickSheetId, string> = {
  calculator: "Калькулятор",
  info: "Что нужно знать",
  calendar: "Календарь",
  bookmarks: "Закладки",
  history: "История",
};

export function isQuickSheetId(id: string): id is QuickSheetId {
  return id in SHEET_TITLES;
}

/**
 * Что панель показывает: плитки целиком или одну шторку без плиток.
 *
 * Одну шторку — когда её открыли не плиткой, а снаружи: кнопкой «История» в
 * шапке (VED-402) или горячей кнопкой из бокового меню (VED-408). Человек
 * просил историю, а не сетку из шестнадцати плиток, под которой её ещё надо
 * найти. Шторка та же самая, что под плиткой, — второй копии нет.
 */
type PanelView = "tiles" | QuickSheetId;

/** Чем панель управляют снаружи: шапка и боковое меню. */
export interface QuickPanelHandle {
  openSheet: (sheet: QuickSheetId) => void;
  /** Настройка верхней панели (VED-434) — из настройки бокового меню. */
  openHeaderSettings: () => void;
}

/** Что настраивают: саму панель или верхнюю панель шапки (VED-434). */
type Tuning = "panel" | "header";

/**
 * Кнопка шапки. Поле нажатия 44×44, а место в ряду — 36, как у кнопок до
 * VED-402 (`-mx-1`): заказчик просил вернуть прежнее расстояние между
 * кнопками (VED-412), а палец по-прежнему попадает с первого раза. Соседние
 * поля нажатия при промежутке ряда 8px сходятся встык, не перекрываясь.
 */
const headerButtonClass =
  "-mx-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-text-1 transition-colors hover:bg-glass hover:text-text-0";

/**
 * Панель горячих кнопок: короткий путь к тому, за чем возвращаются каждый
 * день, из любого места портала.
 *
 * Живёт в шапке, а не отдельной кнопкой поверх страницы: снизу уже стоит
 * полоса плеера, а на Знакомствах ещё и своя нижняя панель — третий
 * плавающий элемент в том же углу спорил бы с обоими.
 *
 * Настраивается прямо здесь же: набор кнопок у человека, который заходит за
 * цитатой, и у того, кто ведёт общину, разный, и угадать за них нельзя.
 *
 * Она же рисует весь ряд кнопок шапки справа — верхнюю панель (VED-412):
 * звёздочку, колокольчик, аватар, «Меню» и любые горячие кнопки, в том
 * порядке, какой выбрал человек (`header-toolbar.ts`). Кнопки, открывающие
 * шторку панели, помечены `data-quick-trigger`: тап по ним при открытой
 * шторке — не «тап мимо панели», иначе он закрывал бы её, а клик следом
 * открывал бы снова.
 *
 * `admin` — у администрации портала панель полностью своя (VED-326): три
 * закреплённые кнопки у неё не закрепляются.
 *
 * `onOpenMenu` — «Меню» (VED-402, VED-412): боковое меню живёт в шапке,
 * панель только просит его открыть. `bell`, `avatar` и `beforeAvatar` тоже
 * рисует шапка — панель лишь ставит их на место в ряду.
 */
export function QuickPanel({
  admin = false,
  onOpenMenu,
  menuOpen = false,
  bell,
  avatar,
  beforeAvatar,
  ref,
}: {
  admin?: boolean;
  /** `trigger` — кнопка, на которую вернуть фокус, когда меню закроют. */
  onOpenMenu?: (trigger: HTMLElement | null) => void;
  menuOpen?: boolean;
  bell?: ReactNode;
  avatar?: ReactNode;
  /** Язык, тема и вход в админку на широком экране — перед аватаром. */
  beforeAvatar?: ReactNode;
  ref?: Ref<QuickPanelHandle>;
}) {
  const [view, setView] = useState<PanelView | null>(null);
  const open = view !== null;
  const [tuning, setTuning] = useState<Tuning | null>(null);
  const [config, setConfig] = useState<QuickConfig>({ ids: [], custom: [] });
  const [headerIds, setHeaderIds] = useState<QuickActionId[]>([
    ...DEFAULT_HEADER_ITEMS,
  ]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const starRef = useRef<HTMLButtonElement>(null);
  const locked = lockedQuickActions(admin);

  const close = useCallback(() => {
    setView(null);
    setTuning(null);
  }, []);
  const show = useCallback((next: PanelView) => {
    setTuning(null);
    setView((current) => (current === next ? null : next));
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      openSheet: (sheet) => {
        setTuning(null);
        setView(sheet);
      },
      openHeaderSettings: () => {
        setView("tiles");
        setTuning("header");
      },
    }),
    [],
  );

  const names = useServiceNames();
  const catalogMap = useServiceCatalog();
  /* Каталог кнопок пересобирается только при смене каталога сервисов или
     своих кнопок: он же ходит в зависимости у плиток и настроек. */
  const catalog = useMemo(
    () =>
      quickActionCatalog(
        config.custom,
        serviceQuickActions({
          available: new Set(catalogMap.keys()),
          name: names,
        }),
      ),
    [catalogMap, config.custom, names],
  );
  const toolbarCatalog = useMemo(() => headerCatalog(catalog), [catalog]);
  const toolbar = useMemo(
    () =>
      resolveHeaderToolbar(
        headerIds,
        new Set(catalog.map((meta) => meta.id)),
      ),
    [headerIds, catalog],
  );

  /* Читаем эффектом: на сервере `localStorage` нет, и ленивый `useState` дал
     бы расхождение гидратации. Тем же способом читают своё `theme-provider`
     и полоса плеера. */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий выше. */
    const read = (key: string) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    };
    const stored = parseQuickConfig(read(STORAGE_KEY));
    setConfig({ ...stored, ids: arrangeQuickActions(stored.ids, locked) });
    setHeaderIds(parseHeaderToolbar(read(HEADER_TOOLBAR_STORAGE_KEY)));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [locked]);

  /* Спрашиваем реквизиты заранее, а не при открытии панели (VED-380): плитка
     «Поддержать» ходила за ними сама и появлялась позже остальных на целый
     сетевой круг. Только тем, у кого эта плитка есть: лишний запрос со
     страницы, где кнопка выключена, порталу не нужен. */
  useEffect(() => {
    if (config.ids.includes("donate")) void loadDonationSettings();
  }, [config.ids]);

  const save = useCallback(
    (next: QuickConfig) => {
      // Закрепление применяется на каждом сохранении: то, что переживает
      // только загрузку страницы, закреплением не является.
      const pinned = { ...next, ids: arrangeQuickActions(next.ids, locked) };
      setConfig(pinned);
      try {
        window.localStorage.setItem(STORAGE_KEY, serializeQuickConfig(pinned));
      } catch {
        // Приватный режим: выбор работает до конца сессии.
      }
    },
    [locked],
  );

  const saveHeader = useCallback((next: QuickActionId[]) => {
    setHeaderIds(next);
    try {
      window.localStorage.setItem(
        HEADER_TOOLBAR_STORAGE_KEY,
        serializeHeaderToolbar(next),
      );
    } catch {
      // Приватный режим: выбор работает до конца сессии.
    }
  }, []);

  // Escape закрывает, как у любой шторки; клик мимо — тоже.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (dialogRef.current?.contains(target)) return;
      if (target?.closest?.("[data-quick-trigger]")) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClick);
    };
  }, [open, close]);

  const title =
    tuning === "panel"
      ? "Настроить панель"
      : tuning === "header"
        ? "Верхняя панель"
        : view === null || view === "tiles"
          ? "Горячие кнопки"
          : SHEET_TITLES[view];

  const openMenu = onOpenMenu
    ? (trigger: HTMLElement | null) => {
        close();
        onOpenMenu(trigger);
      }
    : undefined;

  return (
    <div className="relative flex items-center gap-2">
      {toolbar.map((id) => {
        switch (id) {
          case HEADER_HOTKEYS_ID:
            return (
              <button
                key={id}
                ref={starRef}
                type="button"
                data-quick-trigger=""
                onClick={() => show("tiles")}
                aria-expanded={view === "tiles"}
                aria-label="Горячие кнопки"
                className={headerButtonClass}
              >
                <Sparkles className="size-5" />
              </button>
            );
          case HEADER_BELL_ID:
            return bell ? <Fragment key={id}>{bell}</Fragment> : null;
          case HEADER_AVATAR_ID:
            return (
              <Fragment key={id}>
                {beforeAvatar}
                {avatar}
              </Fragment>
            );
          default: {
            const meta = quickActionMeta(id, catalog);
            if (!meta) return null;
            return (
              <HeaderAction
                key={id}
                meta={meta}
                view={view}
                menuOpen={menuOpen}
                onShow={show}
                onClose={close}
                onOpenMenu={openMenu}
              />
            );
          }
        }
      })}

      {view && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-label={title}
          /*
            Прижата к правому краю окна, а не к кнопке.

            Кнопка стоит в шапке слева от переключателей, и панель, отмеренная
            от неё вправо-налево, уезжала за левый край экрана — заголовок и
            первая плитка оказывались срезаны. Окно шире кнопки всегда, и
            отсчёт от него не зависит от того, сколько соседей в шапке видно
            при текущей ширине.

            Фон сплошной, а не стеклянный. `glass` и даже более плотный
            `sheet` рассчитаны на окна с затемняющей подложкой под ними; у
            панели её нет, она открывается прямо над текстом страницы — и
            строки просвечивали сквозь подписи плиток. Панель не стекло:
            под ней ничего не должно быть видно.

            Ширина (VED-391). На телефоне панель занимает страницу целиком,
            отступив от краёв те же 12 пикселей, что были справа, — и в ряд
            встают четыре кнопки вместо трёх. На широком экране она
            останавливается на 26rem: это ровно четыре плитки прежнего
            размера с промежутками, а растянутая на два монитора панель
            превратила бы плитки в полосы и увела бы их от кнопки, которой
            её открыли.

            Четыре столбца на экране 360 оставляли подписи 63px — меньше,
            чем занимают «Уведомления» или «Вдохновение» (70–71px в шрифте
            плитки). Поэтому боковые поля панели 8px вместо 12, промежуток
            между плитками 4px вместо 6 и поле внутри плитки 2px вместо 4:
            под подпись остаётся 70.5px. Заголовок сдвинут на те же 4px
            обратно и стоит, где стоял.

            Высота (VED-399). Панель не длиннее экрана и листается сама:
            шестнадцать плиток и шторка закладок под ними уходили за нижний
            край, а `fixed` не прокручивается вместе со страницей — третья
            закладка оставалась там, куда палец не достаёт. `overscroll-
            contain`: докрученная до конца панель не тащит за собой
            страницу под ней.
          */
          className="fixed right-3 top-[calc(3.5rem+env(safe-area-inset-top)+0.25rem)] z-50 max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem)] w-[min(26rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-2xl border border-glass-brd bg-bg-1 px-2 py-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between pl-1">
            {/* Номера окна в заголовке больше нет (VED-326): где человек
                находится, теперь написано на самой кнопке окна — названием
                места, а не цифрой. */}
            <h2 className="min-w-0 truncate font-display text-sm font-bold text-text-0">
              {title}
            </h2>
            <div className="flex shrink-0 items-center gap-1">
              {view === "tiles" && (
                <>
                  {/* Настройка верхней панели (VED-434) — там, где заказчик
                      поставил галочки: слева от настройки самой панели. */}
                  <button
                    type="button"
                    onClick={() =>
                      setTuning((value) => (value === "header" ? null : "header"))
                    }
                    aria-pressed={tuning === "header"}
                    aria-label={
                      tuning === "header" ? "Готово" : "Настроить верхнюю панель"
                    }
                    title={
                      tuning === "header" ? "Готово" : "Настроить верхнюю панель"
                    }
                    className="flex size-11 items-center justify-center rounded-full text-text-2 hover:text-text-0"
                  >
                    {tuning === "header" ? (
                      <Check className="size-5" />
                    ) : (
                      <PanelTop className="size-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTuning((value) => (value === "panel" ? null : "panel"))
                    }
                    aria-pressed={tuning === "panel"}
                    aria-label={tuning === "panel" ? "Готово" : "Настроить панель"}
                    title={tuning === "panel" ? "Готово" : "Настроить панель"}
                    className="flex size-11 items-center justify-center rounded-full text-text-2 hover:text-text-0"
                  >
                    {tuning === "panel" ? (
                      <Check className="size-5" />
                    ) : (
                      <Settings2 className="size-5" />
                    )}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={close}
                aria-label="Закрыть"
                className="flex size-11 items-center justify-center rounded-full text-text-2 hover:text-text-0"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          {view !== "tiles" ? (
            <QuickSheet
              sheet={view}
              config={config}
              onChange={save}
              onClose={close}
              onNavigate={close}
            />
          ) : tuning === "panel" ? (
            <QuickSettings
              config={config}
              catalog={catalog}
              locked={locked}
              onChange={save}
            />
          ) : tuning === "header" ? (
            <HeaderSettings
              ids={toolbar}
              catalog={toolbarCatalog}
              onChange={saveHeader}
            />
          ) : (
            <QuickTiles
              config={config}
              catalog={catalog}
              onChange={save}
              onClose={close}
              onOpenMenu={
                openMenu
                  ? () =>
                      openMenu(
                        starRef.current?.isConnected ? starRef.current : null,
                      )
                  : undefined
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Горячая кнопка в шапке (VED-412): та же кнопка, что плитка панели, только
 * значком. Подпись — в `aria-label` и подсказке.
 */
function HeaderAction({
  meta,
  view,
  menuOpen,
  onShow,
  onClose,
  onOpenMenu,
}: {
  meta: QuickActionMeta;
  view: PanelView | null;
  menuOpen: boolean;
  onShow: (next: PanelView) => void;
  onClose: () => void;
  onOpenMenu?: (trigger: HTMLElement | null) => void;
}) {
  const icon = <QuickActionIcon meta={meta} className="size-5" />;
  switch (meta.id) {
    case "menu":
      // Без шапки (в тестах панели) меню открыть некому — кнопки нет.
      if (!onOpenMenu) return null;
      return (
        <button
          type="button"
          onClick={(event) => onOpenMenu(event.currentTarget)}
          aria-label={meta.label}
          title={meta.label}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className={headerButtonClass}
        >
          {icon}
        </button>
      );
    case "player":
      return <HeaderPlayerButton meta={meta} icon={icon} />;
    case "window":
      return <HeaderWindowButton icon={icon} onSwitch={onClose} />;
    case "invite":
      return <HeaderInviteButton icon={icon} />;
    case "donate":
      return (
        <Link
          href="/donate"
          aria-label={meta.label}
          title={meta.label}
          className={headerButtonClass}
        >
          {icon}
        </Link>
      );
  }
  if (meta.href)
    return (
      <Link
        href={meta.href}
        aria-label={meta.label}
        title={meta.label}
        className={headerButtonClass}
      >
        {icon}
      </Link>
    );
  const sheet = meta.id;
  if (!isQuickSheetId(sheet)) return null;
  return (
    <button
      type="button"
      data-quick-trigger=""
      onClick={() => onShow(sheet)}
      aria-expanded={view === sheet}
      aria-label={meta.label}
      title={meta.label}
      className={headerButtonClass}
    >
      {icon}
    </button>
  );
}

function HeaderPlayerButton({
  meta,
  icon,
}: {
  meta: QuickActionMeta;
  icon: ReactNode;
}) {
  const player = usePlayerHotkey();
  return (
    <button
      type="button"
      onClick={() => void player.run()}
      aria-label={meta.label}
      title={meta.hint}
      className={headerButtonClass}
    >
      {icon}
    </button>
  );
}

function HeaderWindowButton({
  icon,
  onSwitch,
}: {
  icon: ReactNode;
  onSwitch: () => void;
}) {
  const windowSwitch = usePortalWindowSwitch();
  return (
    <button
      type="button"
      onClick={() => windowSwitch.go(onSwitch)}
      aria-label={windowSwitch.hint}
      title={windowSwitch.hint}
      className={headerButtonClass}
    >
      {icon}
    </button>
  );
}

function HeaderInviteButton({ icon }: { icon: ReactNode }) {
  const invite = useInviteCopy();
  const label = inviteCopyLabel(invite.state);
  return (
    <button
      type="button"
      onClick={() => void invite.copy()}
      aria-label={label}
      title={label}
      className={headerButtonClass}
    >
      {icon}
      {/* Значок не говорит «скопировано» — говорит живая область. */}
      <span aria-live="polite" className="sr-only">
        {invite.state === "idle" ? "" : label}
      </span>
    </button>
  );
}

/**
 * Настройка верхней панели (VED-412, VED-434): те же строки, что у панели и
 * меню (`TuneRow`). Сначала то, что стоит в шапке, в своём порядке — вместе
 * с закреплёнными колокольчиком и аватаром, чтобы было видно, по какую
 * сторону от них встанет кнопка, — потом остальное по разделам.
 */
function HeaderSettings({
  ids,
  catalog,
  onChange,
}: {
  ids: readonly QuickActionId[];
  catalog: readonly QuickActionMeta[];
  onChange: (next: QuickActionId[]) => void;
}) {
  const chosen = ids
    .map((id) => quickActionMeta(id, catalog))
    .filter((meta): meta is QuickActionMeta => meta !== null);
  const rest = catalog.filter(
    (meta) => !ids.includes(meta.id) && !isHeaderFixed(meta.id),
  );
  const groups: { key: string; label: string; items: QuickActionMeta[] }[] = [
    { key: "on", label: "В шапке", items: chosen },
    {
      key: "builtin",
      label: "Портал",
      items: rest.filter((meta) => meta.kind === "builtin"),
    },
    {
      key: "service",
      label: "Сервисы",
      items: rest.filter((meta) => meta.kind === "service"),
    },
    {
      key: "custom",
      label: "Из закладок",
      items: rest.filter((meta) => meta.kind === "custom"),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div>
      <p className="px-1 pb-2 text-[11px] text-text-1">
        Кнопки справа в шапке, слева направо. Колокольчик и аватар на месте
        всегда, остальных — до {MAX_HEADER_BUTTONS}.
      </p>
      {groups.map((group) => (
        <section key={group.key} className="mb-2 last:mb-0">
          {/* Не заголовок разметкой — см. такую же подпись в `QuickSettings`. */}
          <p
            aria-hidden="true"
            className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-1"
          >
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((meta) => {
              const on = ids.includes(meta.id);
              const block = headerToggleBlock(ids, meta.id);
              const movable = on && !isHeaderFixed(meta.id);
              return (
                <TuneRow
                  key={meta.id}
                  label={meta.label}
                  hint={headerToggleNote(block) ?? meta.hint}
                  on={on}
                  fixed={block !== null}
                  onToggle={() => onChange(toggleHeaderItem(ids, meta.id))}
                  onUp={
                    movable
                      ? () => onChange(moveHeaderItem(ids, meta.id, -1))
                      : undefined
                  }
                  onDown={
                    movable
                      ? () => onChange(moveHeaderItem(ids, meta.id, 1))
                      : undefined
                  }
                  upLabel="Левее"
                  downLabel="Правее"
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Одна шторка — калькулятор, календарь, закладки, история. Рисуется и под
 * плитками, и одна в панели (см. `PanelView`).
 */
function QuickSheet({
  sheet,
  config,
  onChange,
  onClose,
  onNavigate,
}: {
  sheet: QuickSheetId;
  config: QuickConfig;
  onChange: (next: QuickConfig) => void;
  onClose: () => void;
  /** Переход по ссылке из шторки закрывает и саму панель. */
  onNavigate: () => void;
}) {
  switch (sheet) {
    case "calculator":
      return <CalculatorPad onClose={onClose} />;
    case "info":
      return <InfoSheet onClose={onClose} />;
    case "calendar":
      return <CalendarSheet onClose={onClose} />;
    case "history":
      return <HistorySheet onClose={onClose} onNavigate={onNavigate} />;
    case "bookmarks":
      return (
        <BookmarksSheet
          onClose={onClose}
          onNavigate={onNavigate}
          pinned={(path) => config.ids.includes(customQuickActionId(path))}
          onPin={(item) =>
            onChange(
              addCustomQuickAction(config, {
                label: item.title,
                href: item.path,
              }),
            )
          }
        />
      );
  }
}

function QuickTiles({
  config,
  catalog,
  onChange,
  onClose,
  onOpenMenu,
}: {
  config: QuickConfig;
  catalog: QuickActionMeta[];
  onChange: (next: QuickConfig) => void;
  onClose: () => void;
  onOpenMenu?: () => void;
}) {
  const [sheet, setSheet] = useState<QuickSheetId | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  /* Шторка открывается под плитками, а панель на телефоне почти в экран
     высотой: без прокрутки к ней нажатие выглядело бы как «ничего не
     произошло» (VED-399). `nearest` — на широком экране, где шторка и так
     видна, ничего не дёргается. */
  useEffect(() => {
    if (sheet) sheetRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [sheet]);

  // Меню открывает шапка; панель без неё (в тестах, в песочнице) плитку
  // «Меню» просто не рисует — кнопка в пустоту хуже, чем никакой.
  const ids = config.ids.filter((id) => id !== "menu" || onOpenMenu);

  if (ids.length === 0)
    return (
      <p className="px-1 py-2 text-sm text-text-1">
        Панель пуста. Нажмите шестерёнку и выберите, что держать под рукой.
      </p>
    );

  return (
    <>
      {/* Четыре в ряд (VED-391): панель занимает всю ширину телефона, и
          третий столбец оставлял справа пустое поле шириной с плитку. */}
      <ul className="grid grid-cols-4 gap-1">
        {ids.map((id) => {
          const meta = quickActionMeta(id, catalog);
          // Кнопки может не быть: сервис выключили, страницу закладки
          // удалили. Молча пропускаем — чинить это человеку нечем.
          if (!meta) return null;
          return (
            <li key={id}>
              {id === "donate" ? (
                <DonateTile />
              ) : id === "window" ? (
                <WindowTile onSwitch={onClose} />
              ) : id === "invite" ? (
                <InviteTile />
              ) : id === "player" ? (
                <PlayerTile meta={meta} onRun={onClose} />
              ) : id === "menu" ? (
                <button
                  type="button"
                  onClick={onOpenMenu}
                  aria-haspopup="dialog"
                  className={tileClass}
                >
                  <QuickActionIcon meta={meta} />
                  <span className="line-clamp-2">{meta.label}</span>
                </button>
              ) : meta.href ? (
                <Link href={meta.href} onClick={onClose} className={tileClass}>
                  <QuickActionIcon meta={meta} />
                  <span className="line-clamp-2">{meta.label}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (isQuickSheetId(id)) setSheet(id);
                  }}
                  className={tileClass}
                >
                  <QuickActionIcon meta={meta} />
                  <span className="line-clamp-2">{meta.label}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {sheet && (
        <div ref={sheetRef} className="scroll-mb-3">
          <QuickSheet
            sheet={sheet}
            config={config}
            onChange={onChange}
            onClose={() => setSheet(null)}
            onNavigate={onClose}
          />
        </div>
      )}
    </>
  );
}

/**
 * Значок кнопки: у сервиса свой, тот же, что в сетке портала, — по нему
 * сервис узнают, а не читают подпись. У остальных — значок из списка, у
 * своей кнопки из закладки — закладка. Тот же значок стоит у кнопки и в
 * боковом меню (VED-408).
 */
export function QuickActionIcon({
  meta,
  className = TILE_ICON,
}: {
  meta: QuickActionMeta;
  className?: string;
}) {
  if (meta.kind === "service") {
    return (
      <ServiceIcon
        slug={serviceActionSlug(meta.id) ?? undefined}
        className={className}
      />
    );
  }
  if (meta.kind === "custom") return <Bookmark className={className} />;
  const Icon = ICONS[meta.id as BuiltinQuickActionId];
  return <Icon className={className} />;
}


/**
 * Второе окно портала (VED-118, VED-163, VED-326, VED-374).
 *
 * Одна и та же кнопка уводит туда и возвращает обратно, а на самой кнопке
 * стоит НАЗВАНИЕ МЕСТА, где второе окно стоит сейчас: «Работа», «Блог ·
 * Авторы», «Новое окно». Номер окна отвечал только на вопрос «какое из
 * двух», а спрашивают «что там осталось». Куда именно вести, решает модель:
 * окно помнит свой последний адрес и положение прокрутки.
 *
 * На кнопке подпись короткая, в подсказке и у скринридера — полная: короткая
 * обязана держаться в одну строку (VED-374), а в подсказке места сколько
 * угодно. Какой из коротких вариантов влезает, решает ширина плитки на этом
 * экране (`FittedLabel`): после VED-391 плиток в ряду четыре, и на телефоне
 * «Блог · Авторы» уступает место «Авторам».
 */
function WindowTile({ onSwitch }: { onSwitch: () => void }) {
  const windowSwitch = usePortalWindowSwitch();

  return (
    <button
      type="button"
      title={windowSwitch.hint}
      aria-label={windowSwitch.hint}
      onClick={() => windowSwitch.go(onSwitch)}
      className={tileClass}
    >
      <Columns2 className={TILE_ICON} />
      {/* Одна строка, а не `line-clamp-2` (VED-374): «надпись не должна
          быть длинной». Значок от числа строк больше не зависит вовсе —
          его держит верхний отступ плитки (`tileInnerClass`). */}
      <FittedLabel options={windowSwitch.options} />
    </button>
  );
}

/**
 * Плитка без рамки. Отдельно от `tileClass` ради доната: подсветка
 * `vm-quick-attention` красит рамку, а у доната рамка уехала на обёртку
 * (см. `DonateTile`), и вторая рамка внутри читалась бы как кнопка в кнопке.
 *
 * Значок стоит на отступе сверху, а не по центру (VED-374, VED-391). При
 * `justify-center` вторая строка подписи поднимала значок на полстроки — у
 * окна, у длинного имени сервиса, у своей кнопки из закладки, — и ряд
 * значков шёл ступенькой. 14px сверху — ровно то место, где значок стоял
 * при одной строке: 72px − рамка 2px − значок 24 − промежуток 4 − строка
 * 13.75 = 28.25, пополам 14.1. Вторая строка теперь растёт вниз и
 * помещается: 14 + 24 + 4 + 27.5 = 69.5 из 70.
 */
const tileInnerClass =
  "flex h-[72px] w-full flex-col items-center justify-start gap-1 rounded-xl px-0.5 pt-3.5 text-center text-[11px] font-medium leading-tight text-text-1 transition-colors hover:text-text-0";

const tileClass = `${tileInnerClass} border border-glass-brd bg-white/4`;

/**
 * Донат — та же шторка с реквизитами, что и в остальном портале, а не своя
 * копия: реквизиты меняются в админке, и вторая копия разошлась бы с первой.
 * Выключенные пожертвования не рисуют ничего — так же, как везде.
 *
 * При открытии панели кнопка несколько раз мягко подсвечивается (VED-326):
 * портал живёт на пожертвования, но просить об этом текстом на каждой
 * странице — значит мешать. Движение, а не цвет и не размер: подсветка
 * гаснет сама и ничего не двигает вокруг, а под `prefers-reduced-motion`
 * кадры обезврежены в `globals.css`.
 *
 * VED-380: плитка больше не ждёт сервер, чтобы появиться. Реквизиты нужны
 * шторке, а не самой плитке, и пока ответа нет, плитка ведёт на `/donate` —
 * ту же страницу с реквизитами. Панель открывается целиком, и ничего в ней
 * не догоняет остальное. Подсветка висит на обёртке, а не на плитке: обёртка
 * переживает подмену ссылки кнопкой и не начинает мигать заново.
 */
function DonateTile() {
  const donation = useDonationSettings();
  const view = donateTileView(donation);
  if (view === "hidden") return null;

  return (
    <div className="vm-quick-attention h-[72px] rounded-xl border border-glass-brd bg-white/4">
      {view === "sheet" ? (
        <DonateButton
          donation={donation}
          label="Поддержать"
          /* Значок рисует сама кнопка доната, и он мельче плиточного: равняем
             его здесь, а не в общем компоненте, — вне панели размер свой. */
          className={`${tileInnerClass} [&>svg]:size-6`}
        />
      ) : (
        <Link href="/donate" className={tileInnerClass}>
          <HeartHandshake className={TILE_ICON} />
          <span className="w-full truncate">Поддержать</span>
        </Link>
      )}
    </div>
  );
}

/**
 * «Плеер» (VED-416): панель закрывается, полоса плеера выкатывается
 * свёрнутой и играет — см. `usePlayerHotkey`.
 */
function PlayerTile({
  meta,
  onRun,
}: {
  meta: QuickActionMeta;
  onRun: () => void;
}) {
  const player = usePlayerHotkey();
  return (
    <button
      type="button"
      title={meta.hint}
      onClick={() => {
        onRun();
        void player.run();
      }}
      className={tileClass}
    >
      <QuickActionIcon meta={meta} />
      <span className="line-clamp-2">{meta.label}</span>
    </button>
  );
}

/** Ссылка-приглашение в буфер — см. `useInviteCopy`. */
function InviteTile() {
  const invite = useInviteCopy();

  return (
    <button type="button" onClick={() => void invite.copy()} className={tileClass}>
      <Share2 className={TILE_ICON} />
      <span className="line-clamp-2">{inviteCopyLabel(invite.state)}</span>
    </button>
  );
}

/**
 * Календарь — два разных календаря, а не один.
 *
 * Афиша портала знает о программах и встречах, которые завели участники;
 * вайшнавский календарь — об экадаши и явлениях, и вести его у себя значило
 * бы содержать вторую астрономическую службу. Поэтому выбор, а не переход:
 * «когда экадаши» и «что у нас в субботу» — разные вопросы.
 */
function CalendarSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-3 rounded-xl border border-glass-brd bg-bg-1 p-3 text-sm text-text-1">
      <ul className="space-y-2">
        <li>
          <Link
            href="/notices/events"
            onClick={onClose}
            className="text-cyan hover:text-magenta"
          >
            Афиша портала
          </Link>
          <p className="text-xs text-text-1">
            Программы, встречи и события, которые завели участники
          </p>
        </li>
        <li>
          {/* Внешний сайт: `rel` обязателен — без `noopener` открытая
              вкладка получает доступ к нашей через `window.opener`. */}
          <a
            href="https://vcalendar.ru"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan hover:text-magenta"
          >
            Вайшнавский календарь ↗
          </a>
          <p className="text-xs text-text-1">
            Экадаши, посты и дни явления — на vcalendar.ru
          </p>
        </li>
      </ul>
      <button
        type="button"
        onClick={onClose}
        className="mt-3 rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:text-text-0"
      >
        Закрыть
      </button>
    </div>
  );
}

/**
 * «Что нужно знать» — не справка на десять экранов, а короткий ответ на
 * «куда я попал»: три ссылки туда, где остальное написано подробно.
 */
function InfoSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-3 rounded-xl border border-glass-brd bg-bg-1 p-3 text-sm text-text-1">
      <p>
        VedaMatch — портал из отдельных сервисов: Знакомства, Вдохновение,
        Образование, Библиотека, Объявления, Рынок и другие. Заходить в каждый
        отдельно не нужно — всё под одним входом.
      </p>
      <ul className="mt-2 space-y-1">
        <li>
          <Link href="/updates" className="text-cyan hover:text-magenta">
            Что нового и что в планах
          </Link>
        </li>
        <li>
          <Link href="/legal/privacy" className="text-cyan hover:text-magenta">
            Что портал знает о вас
          </Link>
        </li>
        <li>
          <Link href="/support" className="text-cyan hover:text-magenta">
            Спросить у администрации
          </Link>
        </li>
      </ul>
      <button
        type="button"
        onClick={onClose}
        className="mt-3 rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:text-text-0"
      >
        Закрыть
      </button>
    </div>
  );
}

/**
 * Настройка панели. Список читается как сама панель: сначала включённые в
 * своём порядке, потом остальное по разделам — портальные кнопки, сервисы
 * (VED-326) и свои кнопки из закладок (VED-345).
 *
 * `locked` — закреплённые кнопки (VED-326, п. 6). Их переключатель не гаснет
 * совсем, а объявляется недоступным: пропавшая строка выглядела бы как
 * «кнопки нет в списке», и человек пошёл бы искать её в сервисах.
 */
function QuickSettings({
  config,
  catalog,
  locked,
  onChange,
}: {
  config: QuickConfig;
  catalog: QuickActionMeta[];
  locked: readonly QuickActionId[];
  onChange: (next: QuickConfig) => void;
}) {
  const chosen = config.ids
    .map((id) => quickActionMeta(id, catalog))
    .filter((meta): meta is QuickActionMeta => meta !== null);
  const rest = catalog.filter((meta) => !config.ids.includes(meta.id));
  const groups: { key: string; label: string; items: QuickActionMeta[] }[] = [
    { key: "on", label: "В панели", items: chosen },
    {
      key: "builtin",
      label: "Портал",
      items: rest.filter((meta) => meta.kind === "builtin"),
    },
    {
      key: "service",
      label: "Сервисы",
      items: rest.filter((meta) => meta.kind === "service"),
    },
    {
      key: "custom",
      label: "Из закладок",
      items: rest.filter((meta) => meta.kind === "custom"),
    },
  ].filter((group) => group.items.length > 0);

  return (
    /* Список длиннее экрана: сервисов дюжина, да ещё свои кнопки. Листается
       вся панель (VED-399), а не второй прокруткой внутри неё: две
       прокрутки одна в другой палец путает. */
    <div>
      {groups.map((group) => (
        <section key={group.key} className="mb-2 last:mb-0">
          {/* Не заголовок разметкой: панель открывается поверх страницы, и
              h3 внутри неё ломал бы порядок заголовков для скринридера
              (см. «Дизайн-система» в CLAUDE.md). */}
          <p
            aria-hidden="true"
            className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-1"
          >
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((meta) => {
              const on = config.ids.includes(meta.id);
              const fixed = locked.includes(meta.id);
              // «Меню» не выключается, но переставляется (VED-402).
              const required = REQUIRED_QUICK_ACTIONS.includes(meta.id);
              const move = (delta: -1 | 1) => () =>
                onChange({
                  ...config,
                  ids: moveQuickAction(config.ids, meta.id, delta, locked.length),
                });
              return (
                <TuneRow
                  key={meta.id}
                  label={meta.label}
                  hint={fixed || required ? "Всегда в панели" : meta.hint}
                  on={on}
                  fixed={fixed || required}
                  onToggle={() =>
                    onChange({
                      ...config,
                      ids: toggleQuickAction(config.ids, meta.id),
                    })
                  }
                  onUp={on && !fixed ? move(-1) : undefined}
                  onDown={on && !fixed ? move(1) : undefined}
                  /* Свою кнопку из закладки можно убрать совсем (VED-345):
                     галочка только выключает, а выключенная чужая страница
                     осталась бы в списке навсегда. */
                  onRemove={
                    meta.id.startsWith(CUSTOM_ACTION_PREFIX)
                      ? () => onChange(removeCustomQuickAction(config, meta.id))
                      : undefined
                  }
                  removeLabel={`Удалить из панели горячих клавиш: ${meta.label}`}
                />
              );
            })}
          </ul>
        </section>
      ))}
      {catalog.length === BUILTIN_QUICK_ACTIONS.length && (
        <p className="px-1 py-2 text-[11px] text-text-1">
          Сервисы появятся в списке, когда портал ответит.
        </p>
      )}
    </div>
  );
}
