"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useServiceNames } from "@/components/service-catalog-provider";
import {
  inviteCopyLabel,
  useInviteCopy,
  usePlayerHotkey,
  usePortalWindowSwitch,
} from "./quick-action-hooks";
import {
  QUICK_PANEL_STORAGE_KEY,
  QuickActionIcon,
  isQuickSheetId,
  type QuickSheetId,
} from "./quick-panel";
import {
  isExternalQuickHref,
  parseQuickConfig,
  quickActionCatalog,
  quickActionMeta,
  serviceQuickActions,
  type QuickActionId,
  type QuickActionMeta,
} from "./quick-actions";
import {
  SIDE_MENU_SERVICES,
  SIDE_MENU_STORAGE_KEY,
  isSideMenuService,
  moveSideMenuItem,
  parseSideMenuConfig,
  resolveSideMenu,
  serializeSideMenuConfig,
  sideMenuHotkeys,
  toggleSideMenuItem,
  type SideMenuConfig,
} from "./side-menu-config";
import { CirclePause } from "lucide-react";
import { TuneRow } from "./tune-row";
import { PLAYER_PAUSE_LABEL } from "./player-hotkey";

/*
 * Середина бокового меню (VED-408): сервисы и добавленные горячие кнопки —
 * в том порядке и в том составе, какой человек выбрал, — и настройка этого
 * списка. «Главная» над ним и служебные ссылки под ним остаются в шапке.
 *
 * Компонент рисуется только в открытом меню, то есть по нажатию и уже в
 * браузере. Поэтому запись читается ленивым начальным значением, а не
 * эффектом: меню открывается сразу настроенным, без кадра со списком по
 * умолчанию. Тем же способом снимают своё шторки закладок и истории.
 */

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Настройка меню и всё, из чего она собирается. */
export function useSideMenu() {
  const names = useServiceNames();
  const [config, setConfig] = useState<SideMenuConfig>(() =>
    parseSideMenuConfig(readStorage(SIDE_MENU_STORAGE_KEY)),
  );
  /* Свои кнопки из закладок заводятся в панели горячих кнопок (VED-345) —
     меню берёт их оттуда же, а не держит второй список. */
  const [custom] = useState(
    () => parseQuickConfig(readStorage(QUICK_PANEL_STORAGE_KEY)).custom,
  );

  const catalog = useMemo(
    () => quickActionCatalog(custom, serviceQuickActions({ name: names })),
    [custom, names],
  );
  const hotkeys = useMemo(() => sideMenuHotkeys(catalog), [catalog]);
  const visible = useMemo(() => {
    const known = new Set<QuickActionId>([
      ...SIDE_MENU_SERVICES,
      ...hotkeys.map((meta) => meta.id),
    ]);
    return resolveSideMenu(config, known);
  }, [config, hotkeys]);

  const save = useCallback((next: SideMenuConfig) => {
    setConfig(next);
    try {
      window.localStorage.setItem(
        SIDE_MENU_STORAGE_KEY,
        serializeSideMenuConfig(next),
      );
    } catch {
      // Приватный режим: выбор работает, пока открыта вкладка.
    }
  }, []);

  return {
    visible,
    hotkeys,
    hidden: config.hidden,
    meta: (id: QuickActionId) => quickActionMeta(id, catalog),
    toggle: (id: QuickActionId) => save(toggleSideMenuItem(config, visible, id)),
    move: (id: QuickActionId, delta: -1 | 1) =>
      save(moveSideMenuItem(config, visible, id, delta)),
  };
}

export type SideMenuState = ReturnType<typeof useSideMenu>;

const rowClass =
  "flex w-full items-center gap-3 px-4 py-3 rounded-xl text-left text-text-1 hover:text-text-0 hover:bg-glass transition-colors aria-[current=page]:bg-glass aria-[current=page]:text-text-0";

/** Список меню: сервисы и горячие кнопки вперемешку, как их расставили. */
export function SideMenuItems({
  menu,
  currentAttr,
  onClose,
  onOpenSheet,
}: {
  menu: SideMenuState;
  currentAttr: (href: string) => "page" | undefined;
  onClose: () => void;
  /** Шторка горячей кнопки открывается в панели горячих кнопок. */
  onOpenSheet: (sheet: QuickSheetId) => void;
}) {
  return (
    <>
      {menu.visible.map((id) => {
        const meta = menu.meta(id);
        if (!meta) return null;
        return (
          <div key={id}>
            <SideMenuItem
              meta={meta}
              currentAttr={currentAttr}
              onClose={onClose}
              onOpenSheet={onOpenSheet}
            />
          </div>
        );
      })}
    </>
  );
}

function SideMenuItem({
  meta,
  currentAttr,
  onClose,
  onOpenSheet,
}: {
  meta: QuickActionMeta;
  currentAttr: (href: string) => "page" | undefined;
  onClose: () => void;
  onOpenSheet: (sheet: QuickSheetId) => void;
}) {
  const icon = <QuickActionIcon meta={meta} className="h-5 w-5 shrink-0" />;
  const label = <span className="min-w-0 truncate font-medium">{meta.label}</span>;

  if (meta.id === "window") return <WindowItem onClose={onClose} />;
  if (meta.id === "invite") return <InviteItem />;
  if (meta.id === "player") return <PlayerItem meta={meta} onClose={onClose} />;
  // «Поддержать» в меню — страница с реквизитами: шторка доната живёт в
  // панели, а меню закрывается при переходе.
  const href = meta.id === "donate" ? "/donate" : meta.href;
  // «Календарь» (VED-496) ведёт на чужой сайт — новой вкладкой.
  if (href && isExternalQuickHref(href))
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClose}
        className={rowClass}
      >
        {icon}
        {label}
      </a>
    );
  if (href)
    return (
      <Link
        href={href}
        aria-current={isSideMenuService(meta.id) ? currentAttr(href) : undefined}
        onClick={onClose}
        className={rowClass}
      >
        {icon}
        {label}
      </Link>
    );
  const sheet = meta.id;
  if (!isQuickSheetId(sheet)) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onClose();
        onOpenSheet(sheet);
      }}
      aria-haspopup="dialog"
      className={rowClass}
    >
      {icon}
      {label}
    </button>
  );
}

function WindowItem({ onClose }: { onClose: () => void }) {
  const windowSwitch = usePortalWindowSwitch();
  const meta = quickActionMeta("window")!;
  return (
    <button
      type="button"
      title={windowSwitch.hint}
      aria-label={windowSwitch.hint}
      onClick={() => windowSwitch.go(onClose)}
      className={rowClass}
    >
      <QuickActionIcon meta={meta} className="h-5 w-5 shrink-0" />
      <span className="min-w-0 truncate font-medium">
        {windowSwitch.options[0] ?? meta.label}
      </span>
    </button>
  );
}

/** «Плеер» (VED-416): меню закрывается, полоса плеера выкатывается и играет; пока играет — пауза (VED-438). */
function PlayerItem({
  meta,
  onClose,
}: {
  meta: QuickActionMeta;
  onClose: () => void;
}) {
  const player = usePlayerHotkey();
  return (
    <button
      type="button"
      title={player.playing ? PLAYER_PAUSE_LABEL : meta.hint}
      onClick={() => {
        onClose();
        void player.run();
      }}
      className={rowClass}
    >
      {player.playing ? (
        <CirclePause aria-hidden className="h-5 w-5 shrink-0" />
      ) : (
        <QuickActionIcon meta={meta} className="h-5 w-5 shrink-0" />
      )}
      <span className="min-w-0 truncate font-medium">
        {player.playing ? PLAYER_PAUSE_LABEL : meta.label}
      </span>
    </button>
  );
}

/** Приглашение копируется, не закрывая меню: ответ «Скопировано» — здесь же. */
function InviteItem() {
  const invite = useInviteCopy();
  const meta = quickActionMeta("invite")!;
  return (
    <button type="button" onClick={() => void invite.copy()} className={rowClass}>
      <QuickActionIcon meta={meta} className="h-5 w-5 shrink-0" />
      <span aria-live="polite" className="min-w-0 truncate font-medium">
        {inviteCopyLabel(invite.state)}
      </span>
    </button>
  );
}

/**
 * Настройка меню (VED-408): что в нём стоит и в каком порядке, какие
 * сервисы спрятаны и какие горячие кнопки ещё можно добавить. Устроена как
 * настройка панели горячих кнопок — те же строки (`TuneRow`).
 */
export function SideMenuSettings({ menu }: { menu: SideMenuState }) {
  const t = useTranslations("Header");
  const hiddenServices = menu.hidden
    .map((id) => menu.meta(id))
    .filter((meta): meta is QuickActionMeta => meta !== null);
  const addable = menu.hotkeys.filter((meta) => !menu.visible.includes(meta.id));

  const groups = [
    {
      key: "on",
      label: t("menuVisible"),
      items: menu.visible
        .map((id) => menu.meta(id))
        .filter((meta): meta is QuickActionMeta => meta !== null),
    },
    { key: "hidden", label: t("menuHidden"), items: hiddenServices },
    { key: "hotkeys", label: t("menuHotkeys"), items: addable },
  ].filter((group) => group.items.length > 0);

  return (
    <div>
      {groups.map((group) => (
        <section key={group.key} className="mb-3 last:mb-0">
          {/* Не заголовок разметкой: меню — окно поверх страницы, и h3 в
              нём ломал бы порядок заголовков (см. «Дизайн-система»). */}
          <p
            aria-hidden="true"
            className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-1"
          >
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((meta) => {
              const on = menu.visible.includes(meta.id);
              return (
                <TuneRow
                  key={meta.id}
                  label={meta.label}
                  hint={meta.hint}
                  on={on}
                  onToggle={() => menu.toggle(meta.id)}
                  onUp={on ? () => menu.move(meta.id, -1) : undefined}
                  onDown={on ? () => menu.move(meta.id, 1) : undefined}
                  upLabel={t("moveUp")}
                  downLabel={t("moveDown")}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
