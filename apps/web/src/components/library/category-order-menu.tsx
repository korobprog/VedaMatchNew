"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownAZ, ArrowUpDown, Check, ListTree } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { AnchoredPopover } from "@/components/anchored-popover";
import { MenuOptionLabel, menuOptionClass } from "@/components/menu-option";
import { useDismissable } from "@/lib/use-dismissable";
import {
  CATEGORY_ORDER_PARAM,
  categoryOrderHref,
  isAlphabeticalOrder,
} from "./category-order";
import { t } from "./i18n";
import { LIBRARY_ICON_BUTTON } from "./icon-button";
import {
  getOrganizing,
  getOrganizingServer,
  setOrganizing,
  subscribeOrganizing,
} from "./organize-state";

/**
 * «Упорядочить» на странице рубрики с подрубриками — например, список всех
 * проповедников (VED-573). Меню для всех: «Свой порядок» (как выставил
 * админ) или «По алфавиту». Тот, кому дерево можно менять, видит в том же
 * меню третий пункт — «Редактировать порядок», прежний режим перетаскивания.
 * Пока режим открыт, кнопка становится «Готово» и закрывает его одним
 * нажатием.
 *
 * Меню — портальный `AnchoredPopover` (VED-604): от кнопки и целиком в
 * пределах экрана.
 */
export function CategoryOrderMenu({
  locale,
  canOrganize,
}: {
  locale: LibraryLocale;
  canOrganize: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const organizing = useSyncExternalStore(
    subscribeOrganizing,
    getOrganizing,
    getOrganizingServer,
  );
  // Ушли со страницы — режим перетаскивания не должен ждать на следующей.
  useEffect(() => () => setOrganizing(false), []);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(panelRef, close, open, triggerRef);

  const alphabetical = isAlphabeticalOrder(params.get(CATEGORY_ORDER_PARAM));
  const label = t(locale, "tree.organize");
  const chosen = t(locale, alphabetical ? "sort.title" : "sort.custom");

  function choose(next: boolean) {
    setOpen(false);
    if (next === alphabetical) return;
    router.push(categoryOrderHref(pathname, params, next), { scroll: false });
  }

  function startOrganizing() {
    setOpen(false);
    setOrganizing(true);
  }

  if (organizing) {
    const done = t(locale, "tree.done");
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOrganizing(false);
          triggerRef.current?.focus();
        }}
        aria-label={done}
        title={done}
        className={`${LIBRARY_ICON_BUTTON} border-magenta text-text-0`}
      >
        <Check aria-hidden className="size-4" />
      </button>
    );
  }

  const optionClass = menuOptionClass;

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${label}: ${chosen}`}
        title={`${label}: ${chosen}`}
        onClick={() => setOpen((value) => !value)}
        className={`${LIBRARY_ICON_BUTTON} ${
          alphabetical
            ? "border-magenta text-text-0"
            : "border-glass-brd text-text-1 hover:text-text-0"
        }`}
      >
        {alphabetical ? (
          <ArrowDownAZ aria-hidden className="size-4" />
        ) : (
          <ArrowUpDown aria-hidden className="size-4" />
        )}
      </button>
      {open && (
        <AnchoredPopover
          anchorRef={triggerRef}
          panelRef={panelRef}
          align="end"
          width={256}
          role="group"
          aria-label={label}
        >
          <p className="px-3 pb-1 text-xs text-text-2">{label}</p>
          <button
            type="button"
            aria-pressed={!alphabetical}
            onClick={() => choose(false)}
            className={optionClass(!alphabetical)}
          >
            <MenuOptionLabel pressed={!alphabetical}>
              {t(locale, "sort.custom")}
            </MenuOptionLabel>
          </button>
          <button
            type="button"
            aria-pressed={alphabetical}
            onClick={() => choose(true)}
            className={optionClass(alphabetical)}
          >
            <MenuOptionLabel pressed={alphabetical}>
              {t(locale, "sort.title")}
            </MenuOptionLabel>
          </button>
          {canOrganize && (
            <>
              <div aria-hidden className="my-1 border-t border-glass-brd" />
              <button
                type="button"
                onClick={startOrganizing}
                className={optionClass(false)}
              >
                <ListTree aria-hidden className="size-4 shrink-0" />
                {t(locale, "tree.editOrder")}
              </button>
            </>
          )}
        </AnchoredPopover>
      )}
    </div>
  );
}
