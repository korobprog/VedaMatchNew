"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Bot,
  Calculator,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Columns2,
  HeartHandshake,
  History,
  Images,
  Info,
  Mail,
  Quote,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type { RewardsMeDto } from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";
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
import { portalLocationLabels, portalLocationTitle } from "@/lib/portal-location";
import {
  nextPortalWindow,
  portalWindowButtonHint,
  portalWindowTargetUrl,
} from "@/lib/portal-windows";
import {
  switchPortalWindows,
  usePortalWindows,
} from "./portal-windows-store";
import { CalculatorPad } from "./calculator-pad";
import { HistorySheet } from "./history-sheet";
import { FittedLabel } from "./fitted-label";
import {
  BUILTIN_QUICK_ACTIONS,
  CUSTOM_ACTION_PREFIX,
  addCustomQuickAction,
  customQuickActionId,
  lockedQuickActions,
  moveQuickAction,
  parseQuickConfig,
  pinQuickActions,
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
import { copyText } from "@/lib/copy-text";

/** Раскладка панели живёт на устройстве — см. комментарий в quick-actions.ts. */
const STORAGE_KEY = "vedamatch:quick-panel";

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
  window: Columns2,
  bookmarks: Bookmark,
  history: History,
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
 * `admin` — у администрации портала панель полностью своя (VED-326): три
 * закреплённые кнопки у неё не закрепляются.
 */
export function QuickPanel({ admin = false }: { admin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [config, setConfig] = useState<QuickConfig>({ ids: [], custom: [] });
  const panelRef = useRef<HTMLDivElement>(null);
  const locked = lockedQuickActions(admin);

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

  /* Читаем эффектом: на сервере `localStorage` нет, и ленивый `useState` дал
     бы расхождение гидратации. Тем же способом читают своё `theme-provider`
     и полоса плеера. */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий выше. */
    const read = () => {
      try {
        return parseQuickConfig(window.localStorage.getItem(STORAGE_KEY));
      } catch {
        return parseQuickConfig(null);
      }
    };
    const stored = read();
    setConfig({ ...stored, ids: pinQuickActions(stored.ids, locked) });
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
      const pinned = { ...next, ids: pinQuickActions(next.ids, locked) };
      setConfig(pinned);
      try {
        window.localStorage.setItem(STORAGE_KEY, serializeQuickConfig(pinned));
      } catch {
        // Приватный режим: выбор работает до конца сессии.
      }
    },
    [locked],
  );

  // Escape закрывает, как у любой шторки; клик мимо — тоже.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClick);
    };
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Горячие кнопки"
        className="flex size-9 items-center justify-center rounded-lg text-text-1 transition-colors hover:bg-glass hover:text-text-0"
      >
        <Sparkles className="size-5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Горячие кнопки"
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
          */
          className="fixed right-3 top-[calc(3.5rem+env(safe-area-inset-top)+0.25rem)] z-50 w-[min(26rem,calc(100vw-1.5rem))] rounded-2xl border border-glass-brd bg-bg-1 px-2 py-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between pl-1">
            {/* Номера окна в заголовке больше нет (VED-326): где человек
                находится, теперь написано на самой кнопке окна — названием
                места, а не цифрой. */}
            <h2 className="min-w-0 truncate font-display text-sm font-bold text-text-0">
              {tuning ? "Настроить панель" : "Горячие кнопки"}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTuning((value) => !value)}
                aria-pressed={tuning}
                aria-label={tuning ? "Готово" : "Настроить панель"}
                className="flex size-11 items-center justify-center rounded-full text-text-2 hover:text-text-0"
              >
                {tuning ? (
                  <Check className="size-5" />
                ) : (
                  <Settings2 className="size-5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                className="flex size-11 items-center justify-center rounded-full text-text-2 hover:text-text-0"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          {tuning ? (
            <QuickSettings
              config={config}
              catalog={catalog}
              locked={locked}
              onChange={save}
            />
          ) : (
            <QuickTiles
              config={config}
              catalog={catalog}
              onChange={save}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Кнопки, которые открывают шторку под плитками, а не уводят со страницы. */
type SheetId = "calculator" | "info" | "calendar" | "bookmarks" | "history";

function QuickTiles({
  config,
  catalog,
  onChange,
  onClose,
}: {
  config: QuickConfig;
  catalog: QuickActionMeta[];
  onChange: (next: QuickConfig) => void;
  onClose: () => void;
}) {
  const [sheet, setSheet] = useState<SheetId | null>(null);

  if (config.ids.length === 0)
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
        {config.ids.map((id) => {
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
              ) : meta.href ? (
                <Link href={meta.href} onClick={onClose} className={tileClass}>
                  <ActionIcon meta={meta} />
                  <span className="line-clamp-2">{meta.label}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setSheet(id as SheetId)}
                  className={tileClass}
                >
                  <ActionIcon meta={meta} />
                  <span className="line-clamp-2">{meta.label}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {sheet === "calculator" && <CalculatorPad onClose={() => setSheet(null)} />}
      {sheet === "info" && <InfoSheet onClose={() => setSheet(null)} />}
      {sheet === "calendar" && <CalendarSheet onClose={() => setSheet(null)} />}
      {sheet === "history" && (
        <HistorySheet onClose={() => setSheet(null)} onNavigate={onClose} />
      )}
      {sheet === "bookmarks" && (
        <BookmarksSheet
          onClose={() => setSheet(null)}
          onNavigate={onClose}
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
      )}
    </>
  );
}

/**
 * Значок кнопки: у сервиса свой, тот же, что в сетке портала, — по нему
 * сервис узнают, а не читают подпись. У остальных — значок из списка, у
 * своей кнопки из закладки — закладка.
 */
function ActionIcon({ meta }: { meta: QuickActionMeta }) {
  if (meta.kind === "service") {
    return (
      <ServiceIcon
        slug={serviceActionSlug(meta.id) ?? undefined}
        className={TILE_ICON}
      />
    );
  }
  if (meta.kind === "custom") return <Bookmark className={TILE_ICON} />;
  const Icon = ICONS[meta.id as BuiltinQuickActionId];
  return <Icon className={TILE_ICON} />;
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
  const router = useRouter();
  const state = usePortalWindows();
  const names = useServiceNames();
  const options = portalLocationLabels(portalWindowTargetUrl(state), names);
  const title = useCallback(
    (url: string | null) => portalLocationTitle(url, names),
    [names],
  );

  return (
    <button
      type="button"
      title={portalWindowButtonHint(state, title)}
      aria-label={portalWindowButtonHint(state, title)}
      onClick={() => {
        const target = switchPortalWindows(
          nextPortalWindow(state, state.windows.length),
          window.scrollY,
        );
        onSwitch();
        /* `replace`, а не `push` (VED-354): переключение окна — это не шаг
           по истории, а смена того, ЧЬЮ историю мы листаем. Записью в общей
           истории вкладки оно ломало аппаратную кнопку «назад»: она честно
           возвращала к предыдущей записи, а предыдущая принадлежала другому
           окну. */
        router.replace(target.url);
      }}
      className={tileClass}
    >
      <Columns2 className={TILE_ICON} />
      {/* Одна строка, а не `line-clamp-2` (VED-374): «надпись не должна
          быть длинной». Значок от числа строк больше не зависит вовсе —
          его держит верхний отступ плитки (`tileInnerClass`). */}
      <FittedLabel options={options} />
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
 * Ссылка-приглашение в буфер, не уводя со страницы: за ней и приходят —
 * скинуть другу в мессенджер. Полный текст приглашения остаётся в «Баллах»,
 * его собирает сервер из каталога сервисов.
 */
function InviteTile() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      const response = await apiFetch(`${API_URL}/rewards/me`);
      if (!response.ok) throw new Error("rewards");
      const me = (await response.json()) as RewardsMeDto;
      if (!(await copyText(me.link))) throw new Error("clipboard");
      setState("copied");
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("failed");
    }
  }

  return (
    <button type="button" onClick={() => void copy()} className={tileClass}>
      <Share2 className={TILE_ICON} />
      <span className="line-clamp-2">
        {state === "copied"
          ? "Скопировано"
          : state === "failed"
            ? "Не вышло"
            : "Пригласить"}
      </span>
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
    /* Список длиннее экрана: сервисов дюжина, да ещё свои кнопки. Прокрутка
       внутри панели, а не рост панели за край окна. */
    <div className="max-h-[60vh] overflow-y-auto">
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
              return (
                <li key={meta.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    /* `aria-disabled`, а не `disabled`: кнопка остаётся в
                       порядке обхода табом, и скринридер успевает прочитать,
                       почему галочка не снимается. */
                    aria-disabled={fixed || undefined}
                    onClick={() => {
                      if (fixed) return;
                      onChange({
                        ...config,
                        ids: toggleQuickAction(config.ids, meta.id),
                      });
                    }}
                    className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                      fixed ? "cursor-default" : "hover:bg-white/4"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        on
                          ? "border-mint-edge bg-mint text-on-mint"
                          : "border-glass-brd"
                      }`}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-text-0">
                        {meta.label}
                      </span>
                      <span className="block truncate text-[11px] text-text-1">
                        {fixed ? "Всегда в панели" : meta.hint}
                      </span>
                    </span>
                  </button>
                  {on && !fixed && (
                    <>
                      <button
                        type="button"
                        aria-label={`Выше: ${meta.label}`}
                        onClick={() =>
                          onChange({
                            ...config,
                            ids: moveQuickAction(
                              config.ids,
                              meta.id,
                              -1,
                              locked.length,
                            ),
                          })
                        }
                        className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-text-0"
                      >
                        <ChevronUp className="size-5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Ниже: ${meta.label}`}
                        onClick={() =>
                          onChange({
                            ...config,
                            ids: moveQuickAction(
                              config.ids,
                              meta.id,
                              1,
                              locked.length,
                            ),
                          })
                        }
                        className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-text-0"
                      >
                        <ChevronDown className="size-5" />
                      </button>
                    </>
                  )}
                  {/* Свою кнопку из закладки можно убрать совсем (VED-345):
                      галочка только выключает, а выключенная чужая страница
                      осталась бы в списке навсегда. */}
                  {meta.id.startsWith(CUSTOM_ACTION_PREFIX) && (
                    <button
                      type="button"
                      aria-label={`Удалить из панели горячих клавиш: ${meta.label}`}
                      onClick={() =>
                        onChange(removeCustomQuickAction(config, meta.id))
                      }
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-text-0"
                    >
                      <X className="size-5" />
                    </button>
                  )}
                </li>
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
