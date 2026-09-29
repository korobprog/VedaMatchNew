"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
  ExternalLink,
  Music2,
  Pause,
  Play,
  Radio,
  Send,
  Smartphone,
} from "lucide-react";
import type {
  MusicRadioItemDto,
  MusicRadioPublicStateDto,
} from "@vedamatch/shared";
import type { AppManifest } from "@/lib/app-download";
import { formatApkSizeMb } from "@/lib/app-download";
import {
  resolveDownloadDevice,
  type DownloadDevice,
} from "@/lib/app-download-device";
import { fetchPublicMusicRadio } from "@/lib/music-radio-client";
import { getServiceContent, type ServiceContent } from "@/lib/service-content";
import { cn } from "@/lib/utils";
import {
  radioAfterEnd,
  radioItemAt,
  radioServerNow,
  radioSyncPlan,
} from "./radio-sync";
import {
  radioAvatarStack,
  radioListenersLabel,
  radioPromoIndex,
} from "./public-radio-view";

/** Как часто обновлять эфир и счётчик слушателей, мс. */
const REFRESH_MS = 20_000;

/** Сервисы, которые рекламирует страница, — баннер меняется с записью. */
const PROMO_SLUGS = [
  "union",
  "motivation",
  "music",
  "chat",
  "vedabase",
  "library",
] as const;

/** Карточки «Что ещё есть на портале». */
const PORTAL_SLUGS = ["music", "motivation", "union", "chat"] as const;

interface Loaded {
  state: MusicRadioPublicStateDto;
  receivedAt: number;
}

/**
 * Публичная страница «Радио VM» (VED-645): эфир без входа, аватарки
 * слушателей, реклама сервисов портала и кнопки установки приложения.
 *
 * Плеер намеренно проще плеера портала (`radio-provider.tsx`): гостю не
 * нужны мини-плеер, очередь и отметка слушателя — только общий эфир с
 * нужной секунды и переход к следующей записи по `ended`.
 */
export function PublicRadio({
  manifest,
  showTelegram,
}: {
  manifest: AppManifest | null;
  showTelegram: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const loadedRef = useRef<Loaded | null>(null);
  const playingItemRef = useRef<MusicRadioItemDto | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playingItem, setPlayingItem] = useState<MusicRadioItemDto | null>(
    null,
  );
  const [device, setDevice] = useState<DownloadDevice | null>(null);

  useEffect(() => {
    // Вложенной функцией, как в AppDownloadSection: устройство знает только
    // браузер, на сервере кнопки стоят в порядке по умолчанию.
    function resolve() {
      setDevice(resolveDownloadDevice(window.navigator.userAgent));
    }
    resolve();
  }, []);

  const startItem = useCallback((item: MusicRadioItemDto, offset: number) => {
    const audio = audioRef.current;
    if (!audio || !item.streamUrl) return;
    playingItemRef.current = item;
    setPlayingItem(item);
    audio.src = item.streamUrl;
    audio.currentTime = offset;
    void audio.play().catch(() => setPlaying(false));
  }, []);

  /** Свежий эфир: запомнить и, если звучит, выровнять плеер по нему. */
  const apply = useCallback(
    (next: Loaded) => {
      loadedRef.current = next;
      setLoaded(next);
      setFailed(false);
      const audio = audioRef.current;
      const current = playingItemRef.current;
      if (!audio || audio.paused || !current) return;
      const plan = radioSyncPlan(
        next.state,
        { item: current, positionSeconds: audio.currentTime },
        radioServerNow(next.state, next.receivedAt, Date.now()),
        false,
      );
      if (plan.kind === "switch") startItem(plan.item, plan.offset);
    },
    [startItem],
  );

  const refresh = useCallback(async (): Promise<Loaded | null> => {
    try {
      const state = await fetchPublicMusicRadio();
      const next = { state, receivedAt: Date.now() };
      apply(next);
      return next;
    } catch {
      setFailed(true);
      return null;
    }
  }, [apply]);

  useEffect(() => {
    // Первый запрос — вложенной функцией, как устройство выше: состояние
    // меняется только по ответу сети, не синхронно в эффекте.
    function load() {
      void refresh();
    }
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function play() {
    const current = (await refresh()) ?? loadedRef.current;
    if (!current) return;
    const plan = radioSyncPlan(
      current.state,
      null,
      radioServerNow(current.state, current.receivedAt, Date.now()),
      false,
    );
    if (plan.kind !== "switch") return;
    setPlaying(true);
    startItem(plan.item, plan.offset);
  }

  function pause() {
    audioRef.current?.pause();
    setPlaying(false);
  }

  /** Запись кончилась — следующая из эфира, а нет ссылки — спросить эфир. */
  async function onEnded() {
    const current = playingItemRef.current;
    const known = loadedRef.current;
    if (!current || !known) return;
    const serverNow = radioServerNow(known.state, known.receivedAt, Date.now());
    const entry = radioAfterEnd(known.state, current, serverNow);
    if (entry) {
      startItem(entry.item, entry.offset);
      return;
    }
    const fresh = await refresh();
    if (!fresh) return;
    const plan = radioSyncPlan(
      fresh.state,
      null,
      radioServerNow(fresh.state, fresh.receivedAt, Date.now()),
      false,
    );
    if (plan.kind === "switch") startItem(plan.item, plan.offset);
  }

  const state = loaded?.state ?? null;
  // Что показывать, пока звук не включён: эфир на момент ответа. Ответ
  // обновляется раз в 20 секунд — точнее для подписи не нужно.
  const onAir: MusicRadioItemDto | null =
    (playing ? playingItem : null) ??
    (state
      ? (radioItemAt(state, new Date(state.serverTime).getTime()) ??
        state.current)
      : null);
  const listeners = state?.listeners ?? 0;
  const stack = radioAvatarStack(state?.listenerAvatars ?? [], listeners);
  const promos = PROMO_SLUGS.map((slug) => getServiceContent(slug)).filter(
    (service): service is ServiceContent => !!service,
  );
  const promo = promos[radioPromoIndex(onAir?.slotId ?? null, promos.length)];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 pb-28 sm:px-6 sm:pb-16">
      <audio
        ref={audioRef}
        preload="none"
        onEnded={() => void onEnded()}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />

      <section className="grid gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-cyan">
            <Radio aria-hidden className="size-4" />
            Эфир без регистрации
          </p>
          <h1 className="font-display text-4xl font-bold text-text-0 md:text-5xl">
            Радио VedaMatch
          </h1>
          <p className="max-w-xl text-lg text-text-1">
            Киртаны, бхаджаны и записи с программ — один эфир для всех, круглые
            сутки. Нажмите «Слушать»: вход не нужен.
          </p>

          <div className="glass flex flex-col gap-5 rounded-3xl border border-glass-brd p-5 sm:p-6">
            <div className="flex items-center gap-4 sm:gap-5">
              <Cover item={onAir} />
              <div className="flex min-w-0 flex-grow flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-1">
                  Сейчас в эфире
                </span>
                <span className="truncate font-display text-lg text-text-0 sm:text-xl">
                  {itemTitle(onAir, failed)}
                </span>
                {onAir?.track?.artist && (
                  <span className="truncate text-sm text-text-1">
                    {onAir.track.artist.name}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => (playing ? pause() : void play())}
                disabled={!state?.current?.streamUrl}
                aria-label={playing ? "Пауза" : "Слушать эфир"}
                className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-magenta to-[#B23EFF] text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50 sm:size-[72px]"
              >
                {playing ? (
                  <Pause aria-hidden className="size-7" />
                ) : (
                  <Play aria-hidden className="size-7 translate-x-0.5" />
                )}
              </button>
            </div>

            <div
              className="flex flex-wrap items-center gap-4 rounded-2xl bg-bg-2 px-4 py-3"
              aria-live="polite"
            >
              {stack && (
                <div className="flex items-center" aria-hidden>
                  {stack.avatars.map((url, index) => (
                    // eslint-disable-next-line @next/next/no-img-element -- фото с чужих доменов (Google), next/image их не знает
                    <img
                      key={`${url}-${index}`}
                      src={url}
                      alt=""
                      referrerPolicy="no-referrer"
                      className={cn(
                        "size-10 rounded-full border-[3px] border-bg-2 object-cover",
                        index > 0 && "-ml-3",
                      )}
                    />
                  ))}
                  {stack.rest > 0 && (
                    <span className="-ml-3 flex size-10 items-center justify-center rounded-full border-[3px] border-bg-2 bg-bg-1 font-mono text-xs font-bold text-text-0">
                      +{stack.rest}
                    </span>
                  )}
                </div>
              )}
              <span className="text-sm font-semibold text-text-0">
                {radioListenersLabel(listeners)}
              </span>
            </div>

            {state?.next && (
              <p className="text-sm text-text-1">
                Далее: {itemTitle(state.next, false)}
              </p>
            )}
          </div>
        </div>

        <InstallCard
          manifest={manifest}
          showTelegram={showTelegram}
          device={device}
        />
      </section>

      {promo && (
        <section aria-labelledby="radio-promo" className="flex flex-col gap-4">
          <h2
            id="radio-promo"
            className="font-display text-2xl font-bold text-text-0"
          >
            Реклама VedaMatch
          </h2>
          <Link
            href={`/services/${promo.slug}`}
            className="glass flex flex-col gap-3 rounded-3xl border border-glass-brd p-6 transition-colors hover:border-cyan/60 sm:p-10"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-magenta">
              {promo.name}
            </span>
            <span className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
              {promo.tagline}
            </span>
            <span className="max-w-2xl text-text-1">{promo.description}</span>
            <span className="mt-2 font-semibold text-cyan">Подробнее →</span>
          </Link>
        </section>
      )}

      <section aria-labelledby="radio-portal" className="flex flex-col gap-4">
        <h2
          id="radio-portal"
          className="font-display text-2xl font-bold text-text-0"
        >
          Что ещё есть на портале
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PORTAL_SLUGS.map((slug) => getServiceContent(slug))
            .filter((service): service is ServiceContent => !!service)
            .map((service) => (
              <Link
                key={service.slug}
                href={`/services/${service.slug}`}
                className="glass flex min-h-32 flex-col gap-2 rounded-2xl border border-glass-brd p-5 transition-colors hover:border-cyan/60"
              >
                <span className="font-display text-lg text-text-0">
                  {service.name}
                </span>
                <span className="text-sm text-text-1">{service.tagline}</span>
              </Link>
            ))}
        </div>
      </section>

      {/* На телефоне — плашка установки у нижнего края, пока человек
          слушает и листает. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-glass-brd bg-bg-1 px-4 py-3 sm:hidden">
        <span className="flex-grow text-sm font-semibold text-text-0">
          Радио — в приложении
        </span>
        <a
          href="#install"
          className="inline-flex min-h-11 items-center rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 text-sm font-bold text-white"
        >
          Установить
        </a>
      </div>
    </div>
  );
}

function itemTitle(item: MusicRadioItemDto | null, failed: boolean): string {
  if (!item) return failed ? "Эфир недоступен" : "Загружаем эфир…";
  if (item.kind === "insert") return item.insertTitle ?? "Слово редакции";
  return item.track?.title ?? "Запись без названия";
}

function Cover({ item }: { item: MusicRadioItemDto | null }) {
  const url = item?.track?.coverUrl ?? null;
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- обложка из хранилища Музыки по готовой ссылке
    <img
      src={url}
      alt=""
      className="size-20 shrink-0 rounded-2xl object-cover sm:size-28"
    />
  ) : (
    <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-bg-2 text-text-2 sm:size-28">
      <Music2 aria-hidden className="size-8" />
    </span>
  );
}

/**
 * Кнопки установки. Кнопка под устройство гостя стоит первой; цен и
 * призывов оплатить здесь нет — страницу открывают и из приложения
 * (docs/mobile-app-store-links.md).
 */
function InstallCard({
  manifest,
  showTelegram,
  device,
}: {
  manifest: AppManifest | null;
  showTelegram: boolean;
  device: DownloadDevice | null;
}) {
  const android = manifest ? (
    <a
      key="android"
      href={manifest.url}
      rel="noopener"
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-2xl px-4",
        device === "ios"
          ? "border border-glass-brd text-text-0 hover:border-cyan/60"
          : "bg-gradient-to-r from-magenta to-[#B23EFF] text-white",
      )}
    >
      <Download aria-hidden className="size-5 shrink-0" />
      <span className="flex flex-col">
        <span className="font-bold">Скачать для Android</span>
        <span className="text-xs">
          APK {manifest.versionName} · {formatApkSizeMb(manifest.sizeBytes)}
        </span>
      </span>
    </a>
  ) : (
    <Link
      key="android"
      href="/app"
      className="flex min-h-14 items-center gap-3 rounded-2xl border border-glass-brd px-4 text-text-0 hover:border-cyan/60"
    >
      <Download aria-hidden className="size-5 shrink-0" />
      <span className="font-semibold">Android — скоро</span>
    </Link>
  );
  const iphone = (
    <a
      key="ios"
      href="https://ios.vedamatch.com"
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-2xl px-4",
        device === "ios"
          ? "bg-gradient-to-r from-magenta to-[#B23EFF] text-white"
          : "border border-glass-brd text-text-0 hover:border-cyan/60",
      )}
    >
      <Smartphone aria-hidden className="size-5 shrink-0" />
      <span className="flex flex-col">
        <span className="font-semibold">iPhone и iPad</span>
        <span className="text-xs">Веб-версия ios.vedamatch.com</span>
      </span>
    </a>
  );
  const buttons = device === "ios" ? [iphone, android] : [android, iphone];

  return (
    <aside
      id="install"
      aria-labelledby="radio-install"
      className="glass flex scroll-mt-24 flex-col gap-3 self-start rounded-3xl border border-magenta/60 p-6 lg:col-span-5 lg:mt-12"
    >
      <h2
        id="radio-install"
        className="font-display text-xl font-bold text-text-0"
      >
        Слушайте в приложении
      </h2>
      <p className="text-sm text-text-1">
        Эфир, медиатека, чаты и знакомства — в одном приложении.
      </p>
      {buttons}
      {showTelegram && (
        <a
          href="https://t.me/vedamatch_bot"
          className="flex min-h-14 items-center gap-3 rounded-2xl border border-glass-brd px-4 text-text-0 hover:border-cyan/60"
        >
          <Send aria-hidden className="size-5 shrink-0" />
          <span className="flex flex-col">
            <span className="font-semibold">Telegram</span>
            <span className="text-xs text-text-1">
              @vedamatch_bot — без установки
            </span>
          </span>
        </a>
      )}
      <Link
        href="/app"
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-cyan"
      >
        <ExternalLink aria-hidden className="size-4" />
        Все способы установки и QR-код
      </Link>
    </aside>
  );
}
