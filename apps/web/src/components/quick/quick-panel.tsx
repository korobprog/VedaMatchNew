"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Calculator,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  HeartHandshake,
  Info,
  LifeBuoy,
  Quote,
  Settings2,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import type { DonationSettingsDto, RewardsMeDto } from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";
import { DonateButton } from "@/components/donate-sheet";
import { CalculatorPad } from "./calculator-pad";
import {
  QUICK_ACTIONS,
  moveQuickAction,
  parseQuickConfig,
  quickActionMeta,
  serializeQuickConfig,
  toggleQuickAction,
  type QuickActionId,
} from "./quick-actions";

/** Раскладка панели живёт на устройстве — см. комментарий в quick-actions.ts. */
const STORAGE_KEY = "vedamatch:quick-panel";

const ICONS: Record<QuickActionId, React.ComponentType<{ className?: string }>> =
  {
    assistant: Bot,
    aphorism: Quote,
    collections: Sparkles,
    calendar: CalendarDays,
    calculator: Calculator,
    invite: Share2,
    donate: HeartHandshake,
    info: Info,
    support: LifeBuoy,
  };

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
 */
export function QuickPanel() {
  const [open, setOpen] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [ids, setIds] = useState<QuickActionId[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  /* Читаем эффектом: на сервере `localStorage` нет, и ленивый `useState` дал
     бы расхождение гидратации. Тем же способом читают своё `theme-provider`
     и полоса плеера. */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий выше. */
    try {
      setIds(parseQuickConfig(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      setIds(parseQuickConfig(null));
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function save(next: QuickActionId[]) {
    setIds(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeQuickConfig(next));
    } catch {
      // Приватный режим: выбор работает до конца сессии.
    }
  }

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
          */
          className="fixed right-3 top-[calc(3.5rem+env(safe-area-inset-top)+0.25rem)] z-50 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-glass-brd bg-bg-1 p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-text-0">
              {tuning ? "Настроить панель" : "Горячие кнопки"}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTuning((value) => !value)}
                aria-pressed={tuning}
                aria-label={tuning ? "Готово" : "Настроить панель"}
                className="flex size-8 items-center justify-center rounded-full text-text-2 hover:text-text-0"
              >
                {tuning ? (
                  <Check className="size-4" />
                ) : (
                  <Settings2 className="size-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                className="flex size-8 items-center justify-center rounded-full text-text-2 hover:text-text-0"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {tuning ? (
            <QuickSettings ids={ids} onChange={save} />
          ) : (
            <QuickTiles ids={ids} onClose={() => setOpen(false)} />
          )}
        </div>
      )}
    </div>
  );
}

function QuickTiles({
  ids,
  onClose,
}: {
  ids: QuickActionId[];
  onClose: () => void;
}) {
  const [sheet, setSheet] = useState<"calculator" | "info" | null>(null);

  if (ids.length === 0)
    return (
      <p className="px-1 py-2 text-sm text-text-2">
        Панель пуста. Нажмите шестерёнку и выберите, что держать под рукой.
      </p>
    );

  return (
    <>
      <ul className="grid grid-cols-3 gap-1.5">
        {ids.map((id) => {
          const meta = quickActionMeta(id);
          const Icon = ICONS[id];
          return (
            <li key={id}>
              {id === "donate" ? (
                <DonateTile />
              ) : meta.href ? (
                <Link href={meta.href} onClick={onClose} className={tileClass}>
                  <Icon className="size-5" />
                  {meta.label}
                </Link>
              ) : id === "invite" ? (
                <InviteTile />
              ) : (
                <button
                  type="button"
                  onClick={() => setSheet(id as "calculator" | "info")}
                  className={tileClass}
                >
                  <Icon className="size-5" />
                  {meta.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {sheet === "calculator" && <CalculatorPad onClose={() => setSheet(null)} />}
      {sheet === "info" && <InfoSheet onClose={() => setSheet(null)} />}
    </>
  );
}

const tileClass =
  "flex h-[68px] w-full flex-col items-center justify-center gap-1 rounded-xl border border-glass-brd bg-white/4 px-1 text-center text-[11px] font-medium leading-tight text-text-1 transition-colors hover:text-text-0";

/**
 * Донат — та же шторка с реквизитами, что и в остальном портале, а не своя
 * копия: реквизиты меняются в админке, и вторая копия разошлась бы с первой.
 * Настройки читаются при первом открытии панели; выключенные пожертвования
 * не рисуют ничего — так же, как везде.
 */
function DonateTile() {
  const [donation, setDonation] = useState<DonationSettingsDto | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/billing/donation`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: DonationSettingsDto | null) => {
        if (alive) setDonation(data);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <DonateButton donation={donation} label="Поддержать" className={tileClass} />
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
      await navigator.clipboard.writeText(me.link);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("failed");
    }
  }

  return (
    <button type="button" onClick={() => void copy()} className={tileClass}>
      <Share2 className="size-5" />
      {state === "copied"
        ? "Скопировано"
        : state === "failed"
          ? "Не вышло"
          : "Пригласить"}
    </button>
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
        className="mt-3 rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-2 hover:text-text-0"
      >
        Закрыть
      </button>
    </div>
  );
}

function QuickSettings({
  ids,
  onChange,
}: {
  ids: QuickActionId[];
  onChange: (next: QuickActionId[]) => void;
}) {
  return (
    <ul className="space-y-1">
      {/* Сначала включённые в своём порядке, потом остальные: список должен
          читаться как сама панель, иначе стрелки двигают вслепую. */}
      {[
        ...ids,
        ...QUICK_ACTIONS.map((action) => action.id).filter(
          (id) => !ids.includes(id),
        ),
      ].map((id) => {
        const meta = quickActionMeta(id);
        const on = ids.includes(id);
        return (
          <li key={id} className="flex items-center gap-1.5">
            <button
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => onChange(toggleQuickAction(ids, id))}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/4"
            >
              <span
                aria-hidden="true"
                className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                  on ? "border-mint-edge bg-mint text-on-mint" : "border-glass-brd"
                }`}
              >
                {on && <Check className="size-3" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-text-0">
                  {meta.label}
                </span>
                <span className="block truncate text-[11px] text-text-2">
                  {meta.hint}
                </span>
              </span>
            </button>
            {on && (
              <>
                <button
                  type="button"
                  aria-label={`Выше: ${meta.label}`}
                  onClick={() => onChange(moveQuickAction(ids, id, -1))}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-text-0"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Ниже: ${meta.label}`}
                  onClick={() => onChange(moveQuickAction(ids, id, 1))}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-text-0"
                >
                  <ChevronDown className="size-4" />
                </button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
