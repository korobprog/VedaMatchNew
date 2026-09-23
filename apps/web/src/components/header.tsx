"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isPortalAdmin } from "@vedamatch/shared";
import type { UserProfile } from "@vedamatch/shared";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Settings2,
  X,
  Home,
  HeartHandshake,
  LifeBuoy,
  Bell,
  Gift,
  MoreHorizontal,
  PanelTop,
} from "lucide-react";
import { ServiceIcon } from "@/components/icons/service-icons";
import { LogoutButton } from "@/components/logout-button";
import { CartBadge } from "@/components/market/cart-badge";
import {
  QuickPanel,
  type QuickPanelHandle,
  type QuickSheetId,
} from "@/components/quick/quick-panel";
import {
  SideMenuItems,
  SideMenuSettings,
  useSideMenu,
} from "@/components/quick/side-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { VedaMatchMark } from "@/components/icons/vedamatch-mark";
import { useServiceNames } from "@/components/service-catalog-provider";
import { SERVICE_CONTENT } from "@/lib/service-content";
import { useDialogFocus, useDismissable } from "@/lib/use-dismissable";
import { useEdgeSwipe, type EdgeSide } from "@/lib/use-edge-swipe";
import { useTouchShield } from "@/lib/use-touch-shield";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

// Список сервисов — единый источник `lib/service-content.ts`: в шапке те же
// те же пункты и в том же порядке, что на лендинге и в /services. Подписи
// зависят от языка интерфейса, поэтому список собирается внутри компонента.
function useNavItems(): NavItem[] {
  const t = useTranslations("Common");
  const names = useServiceNames();
  const home = t("home");
  return useMemo(
    () => [
      { href: "/", label: home, icon: <Home size={20} /> },
      ...SERVICE_CONTENT.map((service) => ({
        href: service.route,
        label: names(service.slug, service.name),
        icon: <ServiceIcon slug={service.slug} className="h-5 w-5" />,
      })),
    ],
    [home, names],
  );
}

/** Текущий раздел: точное совпадение для «/», иначе — префикс маршрута. */
export function isCurrentRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const navLinkClass =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-text-1 hover:text-text-0 hover:bg-glass transition-colors aria-[current=page]:bg-glass aria-[current=page]:text-text-0";

/** Тот же пункт, но одной иконкой: подпись живёт в title и aria-label. */
const navIconLinkClass =
  "flex h-10 w-10 items-center justify-center rounded-xl text-text-1 hover:text-text-0 hover:bg-glass transition-colors aria-[current=page]:bg-glass aria-[current=page]:text-text-0";

function MoreNavMenu({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const t = useTranslations("Header");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismissable(ref, close, open);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center p-2 rounded-xl text-text-1 hover:text-text-0 hover:bg-glass transition-colors"
        aria-label={t("moreServices")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
      >
        <MoreHorizontal size={20} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-glass-brd bg-bg-1 p-1.5 shadow-lg z-50"
          >
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={isCurrentRoute(pathname, item.href) ? "page" : undefined}
                onClick={close}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-text-1 hover:text-text-0 hover:bg-glass transition-colors aria-[current=page]:bg-glass aria-[current=page]:text-text-0"
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LogoutItem() {
  const t = useTranslations("Common");
  return (
    <LogoutButton
      variant="ghost"
      className="w-full justify-start gap-3 px-4 py-3 text-sm font-normal hover:bg-red-400/10 hover:text-red-400"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16,17 21,12 16,7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      <span className="text-sm">{t("signOut")}</span>
    </LogoutButton>
  );
}

export function Header({ user }: { user: UserProfile }) {
  const t = useTranslations("Header");
  const tCommon = useTranslations("Common");
  const navItems = useNavItems();
  /*
    Боковое меню — одно и то же, но выдвигается с любой стороны (VED-191):
    плиткой «Меню» в панели горячих кнопок и свайпом от правого края влево —
    справа, свайпом от левого края вправо — слева. Открыто не больше одного.

    Бургера в шапке больше нет (VED-402): его место заняла кнопка «История»,
    а сам он переехал плиткой в панель горячих кнопок.
  */
  const [drawer, setDrawer] = useState<EdgeSide | null>(null);
  const isOpen = drawer !== null;
  /* Настройка меню (VED-408): пока она открыта, в меню вместо списка —
     галочки и стрелки, а служебные ссылки под ним убраны. */
  const [tuning, setTuning] = useState(false);
  const pathname = usePathname();
  const drawerId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const quickRef = useRef<QuickPanelHandle>(null);
  /* Куда вернуть фокус при закрытии: на звёздочку, если меню открыли плиткой
     «Меню», и туда, где он был, если открыли свайпом, — иначе после жеста
     фокус прыгал бы в шапку, а клавиатура и скринридер теряли место. */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [shielded, raiseShield] = useTouchShield();
  const closeDrawer = useCallback(() => {
    setDrawer(null);
    setTuning(false);
  }, []);
  const openDrawer = useCallback((side: EdgeSide, from: HTMLElement | null) => {
    returnFocusRef.current = from;
    setDrawer(side);
  }, []);
  /*
    Закрывается меню крестиком, Escape, тапом по подложке и мазком к краю —
    но НЕ касанием снаружи в момент, когда палец коснулся стекла (VED-408).
    Раньше меню пропадало уже на `touchstart` по подложке, и остаток того же
    касания — мазок, которым человек закрывал меню, — доставался странице:
    срабатывали кнопки и ссылки под пальцем. Теперь тап по подложке — это
    `click` по самой подложке, а она на месте до конца касания.
  */
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeDrawer();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeDrawer]);
  useDialogFocus(isOpen, drawerRef, returnFocusRef);
  useEdgeSwipe({
    open: drawer,
    onOpen: (side) => {
      const active = document.activeElement;
      openDrawer(
        side,
        active instanceof HTMLElement && active !== document.body ? active : null,
      );
    },
    // Меню закрывается посреди мазка — хвост мазка забирает заслон.
    onClose: () => {
      raiseShield();
      closeDrawer();
    },
  });
  const currentAttr = (href: string) =>
    isCurrentRoute(pathname, href) ? ("page" as const) : undefined;

  return (
    <>
      <header className="sticky top-0 z-50 bg-bg-0/80 backdrop-blur-xl border-b border-glass-brd safe-top">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 h-14">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <VedaMatchMark className="h-9 w-9" />
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="font-display font-bold text-text-0">VedaMatch</span>
              {/* Значок беты стоит рядом с названием, а не на самом знаке —
                  здесь он виден на каждой странице портала, а не только на
                  главной, и не перекрывает мелкую деталь логотипа. */}
              <span className="rounded-full bg-gradient-to-r from-magenta to-[#B23EFF] px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider leading-none text-white shadow-[0_0_6px_rgba(255,62,158,0.6)]">
                {t("beta")}
              </span>
            </span>
          </Link>

          {/* Полный ряд сервисов на широких экранах — иконками, без подписей.
              С подписями девять пунктов занимают 1222px, а контейнер шапки
              ограничен 1152px: ряд выталкивал колокольчик, переключатели и
              аватар за край экрана, и страница ехала вбок. Название сервиса
              остаётся в title и aria-label. */}
          <nav aria-label={t("services")} className="hidden xl:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={currentAttr(item.href)}
                aria-label={item.label}
                title={item.label}
                className={navIconLinkClass}
              >
                {item.icon}
              </Link>
            ))}
          </nav>

          {/* На md/lg не хватает места под полные подписи — показываем первый пункт и остальные под тремя точками */}
          <nav aria-label={t("services")} className="hidden md:flex xl:hidden items-center gap-1">
            <Link
              href={navItems[0].href}
              aria-current={currentAttr(navItems[0].href)}
              aria-label={navItems[0].label}
              className={navLinkClass}
              title={navItems[0].label}
            >
              {navItems[0].icon}
            </Link>
            <MoreNavMenu items={navItems.slice(1)} pathname={pathname} />
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Сама CartBadge решает, показываться ли — рендерится только
                когда в корзине что-то лежит, независимо от раздела. */}
            <CartBadge />
            {/* Верхняя панель (VED-412): звёздочка горячих кнопок,
                колокольчик, аватар и «Меню» — или то, что человек поставил
                вместо них в настройке. Ряд рисует панель горячих кнопок: она
                же хранит, что в нём и в каком порядке, и она же открывает
                шторки его кнопок. Колокольчик и аватар закреплены: это вход
                в уведомления и в профиль, их не убрать.
                Админу три закреплённые кнопки панели не закрепляются
                (VED-326): панель у него рабочая. */}
            <QuickPanel
              ref={quickRef}
              admin={isPortalAdmin(user)}
              onOpenMenu={(trigger) => openDrawer("right", trigger)}
              menuOpen={isOpen}
              bell={<NotificationBell />}
              beforeAvatar={
                <>
                  <LocaleToggle className="hidden sm:flex" />
                  <ThemeToggle className="hidden sm:flex" />
                  {isPortalAdmin(user) && (
                    <Link
                      href="/admin"
                      className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-1 hover:text-magenta border border-glass-brd hover:border-magenta/30 transition-colors"
                    >
                      {t("admin")}
                    </Link>
                  )}
                </>
              }
              avatar={
                <Link href="/profile" className="flex shrink-0 items-center gap-2">
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName}
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-glass text-sm font-semibold text-text-0">
                      {user.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </Link>
              }
            />
          </div>
        </div>
      </header>

      {/*
        Боковое меню (VED-191). Появляется и исчезает мгновенно, без
        выезда и затухания: заказчик просил «убрать анимацию выхода обоих
        панелей, чтобы появлялись мгновенно». Под `prefers-reduced-motion`
        анимировать тем более нечего.

        Панель одна и та же с обеих сторон — тот же список, те же кнопки;
        меняется только край, к которому она прижата, и сторона рамки.

        Подложка лежит выше шапки (VED-408): раньше шапка оставалась над ней
        живой, потому что в ней был бургер, закрывающий меню. Бургера нет, и
        мазок, закрывающий меню, не должен задевать ни шапку, ни полосу
        плеера внизу — ничего за пределами панели.

        Подложка живёт чуть дольше меню: пока поднят заслон (см.
        `useTouchShield`), она прозрачная и забирает себе хвост мазка. Это
        тот же элемент — React его не пересоздаёт, — поэтому касание,
        начатое на подложке, до конца остаётся на ней.
      */}
      {(drawer || shielded) && (
        <div
          aria-hidden="true"
          data-testid="drawer-backdrop"
          className={`fixed inset-0 z-[60] ${
            drawer ? "bg-bg-0/95 backdrop-blur-xl" : ""
          }`}
          onClick={(event) => {
            if (drawer) closeDrawer();
            else event.preventDefault();
          }}
        />
      )}
      {drawer && (
        <div
          ref={drawerRef}
          id={drawerId}
          role="dialog"
          aria-modal="true"
          aria-label={t("menu")}
          tabIndex={-1}
          data-side={drawer}
          className={`fixed top-0 bottom-0 z-[60] w-72 max-w-[85vw] overflow-y-auto overscroll-contain bg-bg-1 outline-none ${
            drawer === "right"
              ? "right-0 border-l border-glass-brd"
              : "left-0 border-r border-glass-brd"
          }`}
        >
              {/* Место под шапку не резервируем: панель накрывает её целиком,
                  и полоса в высоту шапки читалась как пустое место (VED-15).
                  Своего ряда у крестика тоже нет — он занимал ту же пустую
                  строку над «Главной». Теперь крестик стоит справа в строке
                  «Главной», а список начинается от самого верха панели.
                  Слева от крестика — настройка меню (VED-408): заказчик
                  отметил это место на скриншоте. */}
              {/* `min-h-full`, а не `h-full` (VED-428): при высоте ровно в
                  экран длинный список (настройка меню с дюжиной горячих
                  кнопок) вылезал из блока, и нижнее поле оставалось на
                  границе экрана, а не под последней строкой — её подпись
                  уходила за край. Теперь блок растёт вместе со списком, а
                  поле снизу — ещё и на системную полосу телефона. */}
              <div
                className={`relative flex min-h-full flex-col pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] ${
                  tuning ? "px-3" : "px-6"
                }`}
              >
                <div className="absolute right-3 top-[calc(0.875rem+env(safe-area-inset-top))] z-10 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTuning((value) => !value)}
                    aria-pressed={tuning}
                    aria-label={tuning ? t("customizeDone") : t("customizeMenu")}
                    title={tuning ? t("customizeDone") : t("customizeMenu")}
                    className="flex size-11 items-center justify-center rounded-lg text-text-1 transition-colors hover:bg-glass hover:text-text-0"
                  >
                    {tuning ? <Check size={20} /> : <Settings2 size={20} />}
                  </button>
                  <button
                    type="button"
                    onClick={closeDrawer}
                    aria-label={t("closeMenu")}
                    className="flex size-11 items-center justify-center rounded-lg text-text-1 transition-colors hover:bg-glass hover:text-text-0"
                  >
                    <X size={20} />
                  </button>
                </div>
                <DrawerNav
                  tuning={tuning}
                  homeLabel={navItems[0].label}
                  currentAttr={currentAttr}
                  onClose={closeDrawer}
                  onOpenSheet={(sheet) => quickRef.current?.openSheet(sheet)}
                  onOpenHeaderSettings={() => {
                    closeDrawer();
                    quickRef.current?.openHeaderSettings();
                  }}
                />
                {!tuning && (
                <>
                {/* Админка и «Добавить новость» — под списком сервисов
                    (VED-15): первой в панели должна стоять «Главная», за
                    ней сервисы, и только потом служебное. Раньше блок
                    висел сверху и отодвигал сервисы вниз: администратору
                    так было ближе, но панель открывают ради сервисов, а
                    не ради админки. Обычный участник блока не видит, и
                    для него ничего не меняется. */}
                {isPortalAdmin(user) && (
                  <div className="mt-4 pt-4 border-t border-glass-brd">
                    {/* Один вход: разделы админки живут в её собственном
                        сайдбаре, дублировать их список в бургере незачем. */}
                    <Link
                      href="/admin"
                      onClick={closeDrawer}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-magenta hover:bg-magenta/10 transition-colors"
                    >
                      <span className="text-sm font-medium">{t("adminPanel")}</span>
                    </Link>
                    {/* Новость пишут чаще, чем заходят в остальную админку, а
                        лежала она третьим разделом внутри «Версии и новостей».
                        Ссылка ведёт сразу к открытой форме — см. `?new=1`. */}
                    <Link
                      href="/admin/changelog?new=1"
                      onClick={closeDrawer}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-magenta hover:bg-magenta/10 transition-colors"
                    >
                      <span className="text-sm font-medium">{t("addNews")}</span>
                    </Link>
                  </div>
                )}

                <div className="mt-auto pt-4 border-t border-glass-brd space-y-1">
                  <div className="px-1 pb-3">
                    <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-text-2">
                      {tCommon("language")}
                    </p>
                    <LocaleToggle variant="full" />
                  </div>
                  <div className="px-1 pb-3">
                    <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-text-2">
                      {tCommon("theme")}
                    </p>
                    <ThemeToggle variant="full" />
                  </div>
                  <Link
                    href="/self-identification"
                    onClick={closeDrawer}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-gold hover:bg-glass transition-colors"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                    </svg>
                    <span className="text-sm">{t("selfIdentification")}</span>
                  </Link>
                  <Link
                    href="/notifications"
                    onClick={closeDrawer}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-cyan hover:bg-glass transition-colors"
                  >
                    <Bell size={20} />
                    <span className="text-sm">{t("notifications")}</span>
                  </Link>
                  {/* Баллы — личный пункт, как самоидентификация и
                      уведомления, а не сервис: в меню «···» рядом с
                      Знакомствами и Рынком им было бы не место. На телефоне
                      это единственная навигация, доступная с любой страницы,
                      — без неё за ссылкой приходилось идти через главную. */}
                  <Link
                    href="/rewards"
                    onClick={closeDrawer}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-cyan hover:bg-glass transition-colors"
                  >
                    <Gift size={20} />
                    <span className="text-sm">{t("rewards")}</span>
                  </Link>
                  <Link
                    href="/support"
                    onClick={closeDrawer}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-cyan hover:bg-glass transition-colors"
                  >
                    <LifeBuoy size={20} />
                    <span className="text-sm">{tCommon("support")}</span>
                  </Link>
                  {/* «Поддержать» рядом с «Поддержкой» (VED-11, VED-12,
                      VED-62): до этого просьба о помощи жила только кнопкой
                      внутри «Вдохновения» и статистики, и найти её было нечем. */}
                  <Link
                    href="/donate"
                    onClick={closeDrawer}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-gold hover:bg-glass transition-colors"
                  >
                    <HeartHandshake size={20} />
                    <span className="text-sm">{t("donate")}</span>
                  </Link>
                  <Link
                    href="/updates"
                    onClick={closeDrawer}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-cyan hover:bg-glass transition-colors"
                  >
                    <span className="text-sm">{t("whatsNew")}</span>
                  </Link>
                  <LogoutItem />
                </div>
                </>
                )}
              </div>
        </div>
      )}
    </>
  );
}

/**
 * Список бокового меню: «Главная», за ней сервисы и горячие кнопки в том
 * порядке и составе, какой выбрал человек (VED-408), — или их настройка.
 *
 * Отдельным компонентом, потому что настройка меню читается из хранилища
 * при монтировании (`useSideMenu`), а монтируется он только в открытом
 * меню — на сервере меню не рисуется, и расхождения гидратации нет.
 */
function DrawerNav({
  tuning,
  homeLabel,
  currentAttr,
  onClose,
  onOpenSheet,
  onOpenHeaderSettings,
}: {
  tuning: boolean;
  homeLabel: string;
  currentAttr: (href: string) => "page" | undefined;
  onClose: () => void;
  onOpenSheet: (sheet: QuickSheetId) => void;
  onOpenHeaderSettings: () => void;
}) {
  const t = useTranslations("Header");
  const menu = useSideMenu();

  if (tuning)
    return (
      <>
        {/* Место справа — под настройку и крестик, как у «Главной». */}
        <p className="mr-[5.25rem] flex min-h-12 items-center px-1 font-display text-sm font-bold text-text-0">
          {t("customizeMenu")}
        </p>
        <SideMenuSettings menu={menu} />
        {/* Вход в настройку верхней панели (VED-412) и отсюда: звёздочку
            можно убрать из шапки, и тогда панель горячих кнопок с её
            настройкой шапки становится не найти — а меню остаётся. */}
        <div className="mt-4 border-t border-glass-brd pt-3">
          <button
            type="button"
            onClick={onOpenHeaderSettings}
            aria-haspopup="dialog"
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-text-1 transition-colors hover:bg-glass hover:text-text-0"
          >
            <PanelTop size={20} aria-hidden="true" />
            <span>{t("customizeHeader")}</span>
          </button>
        </div>
      </>
    );

  return (
    <nav aria-label={t("services")} className="flex flex-col gap-1">
      <div>
        <Link
          href="/"
          aria-current={currentAttr("/")}
          onClick={onClose}
          // Место справа — под настройку меню и крестик: иначе подсветка
          // «Главной» уходила бы под кнопки.
          className="mr-[5.25rem] flex items-center gap-3 px-4 py-3 rounded-xl text-text-1 hover:text-text-0 hover:bg-glass transition-colors aria-[current=page]:bg-glass aria-[current=page]:text-text-0"
        >
          <Home size={20} />
          <span className="font-medium">{homeLabel}</span>
        </Link>
      </div>
      <SideMenuItems
        menu={menu}
        currentAttr={currentAttr}
        onClose={onClose}
        onOpenSheet={onOpenSheet}
      />
    </nav>
  );
}
