"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RewardsMeDto } from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";
import { copyText } from "@/lib/copy-text";
import { useServiceNames } from "@/components/service-catalog-provider";
import { portalLocationLabels, portalLocationTitle } from "@/lib/portal-location";
import {
  nextPortalWindow,
  portalWindowButtonHint,
  portalWindowNumber,
  portalWindowTargetUrl,
} from "@/lib/portal-windows";
import { getPlaybackState } from "@/lib/music-playback-api";
import { useMusicPlayer } from "@/components/music/player/player-provider";
import {
  revealMusicPlayerCollapsed,
  stowMusicPlayer,
} from "@/components/music/player/player-reveal";
import { useMusicRadio } from "@/components/music/radio/radio-provider";
import { switchPortalWindows, usePortalWindows } from "./portal-windows-store";
import { planPlayerHotkey, restorePlan } from "./player-hotkey";

/*
 * Поведение горячих кнопок, у которых оно своё, а не переход по ссылке.
 * Отдельно от плиток, потому что те же кнопки живут и в боковом меню
 * (VED-408): второй копией переключения окна или копирования приглашения
 * меню разошлось бы с панелью при первой же правке.
 */

/**
 * Второе окно портала (VED-118, VED-163, VED-326, VED-374): куда ведёт
 * кнопка, как она называется (`options` — короткие подписи от длинной к
 * короткой, `hint` — полное название для подсказки и скринридера) и сам
 * переход.
 */
export function usePortalWindowSwitch() {
  const router = useRouter();
  const state = usePortalWindows();
  const names = useServiceNames();
  const title = useCallback(
    (url: string | null) => portalLocationTitle(url, names),
    [names],
  );

  const go = useCallback(
    (before?: () => void) => {
      const target = switchPortalWindows(
        nextPortalWindow(state, state.windows.length),
        window.scrollY,
      );
      before?.();
      /* `replace`, а не `push` (VED-354): переключение окна — это не шаг
         по истории, а смена того, ЧЬЮ историю мы листаем. Записью в общей
         истории вкладки оно ломало аппаратную кнопку «назад»: она честно
         возвращала к предыдущей записи, а предыдущая принадлежала другому
         окну. */
      router.replace(target.url);
    },
    [router, state],
  );

  return {
    hint: portalWindowButtonHint(state, title),
    options: portalLocationLabels(portalWindowTargetUrl(state), names),
    /** Номер окна, куда ведёт кнопка (VED-469): цифрой в углу значка. */
    number: portalWindowNumber(nextPortalWindow(state, state.windows.length)),
    go,
  };
}

export type InviteCopyState = "idle" | "copied" | "failed";

/** Подпись кнопки приглашения в каждом из состояний. */
export function inviteCopyLabel(state: InviteCopyState): string {
  return state === "copied"
    ? "Скопировано"
    : state === "failed"
      ? "Не вышло"
      : "Пригласить";
}

/** Что показывает окно «Пригласить» (VED-618). */
export interface InviteSheetData {
  /** Готовый текст с личной ссылкой — ровно то, что ушло в буфер. */
  message: string;
  /** Скопировалось ли: нет — текст в окне, его можно выделить руками. */
  copied: boolean;
  /** Администратор — в окне есть «Изменить текст». */
  canEdit: boolean;
}

async function fetchInvite(): Promise<RewardsMeDto> {
  const response = await apiFetch(`${API_URL}/rewards/me`);
  if (!response.ok) throw new Error("rewards");
  return (await response.json()) as RewardsMeDto;
}

/** Текст приглашения из ответа; старый API без поля — одна ссылка. */
function inviteMessageOf(me: RewardsMeDto): string {
  return me.inviteMessage || me.link;
}

/**
 * Приглашение в буфер, не уводя со страницы: за ним и приходят — скинуть
 * другу в мессенджер. VED-618: копируется уже не голая ссылка, а полный
 * текст приглашения с личной ссылкой (шаблон — на сервере, правит
 * администратор), и тут же открывается окно с этим текстом: человек видит,
 * что отправит, а администратор правит текст прямо там.
 *
 * `dialogRef` вешается на `<InviteSheet>` рядом с кнопкой.
 */
export function useInviteCopy() {
  const [state, setState] = useState<InviteCopyState>("idle");
  const [sheet, setSheet] = useState<InviteSheetData | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const copy = useCallback(async () => {
    let me: RewardsMeDto;
    try {
      me = await fetchInvite();
    } catch {
      setState("failed");
      return;
    }
    const message = inviteMessageOf(me);
    const copied = await copyText(message);
    setSheet({ message, copied, canEdit: Boolean(me.canEditInviteText) });
    setState(copied ? "copied" : "failed");
    if (copied) window.setTimeout(() => setState("idle"), 2000);
    // jsdom и старые браузеры без `showModal`: кнопка всё равно копирует.
    const dialog = dialogRef.current;
    if (dialog && !dialog.open && typeof dialog.showModal === "function") {
      dialog.showModal();
    }
  }, []);

  /** После правки шаблона: текст с личной ссылкой собирает сервер. */
  const reload = useCallback(async () => {
    const me = await fetchInvite();
    setSheet((prev) => ({
      message: inviteMessageOf(me),
      copied: prev?.copied ?? false,
      canEdit: Boolean(me.canEditInviteText),
    }));
  }, []);

  const recopy = useCallback(async () => {
    if (!sheet) return;
    const copied = await copyText(sheet.message);
    setSheet({ ...sheet, copied });
  }, [sheet]);

  return { state, copy, sheet, dialogRef, reload, recopy };
}

export type InviteCopy = ReturnType<typeof useInviteCopy>;

/**
 * Горячая кнопка «Плеер» (VED-416): полоса плеера выкатывается свёрнутой и
 * играет, а повторное нажатие ставит на паузу (VED-438) — см.
 * `player-hotkey.ts`, что делается в каком состоянии. `playing` — показать
 * на кнопке паузу вместо «играть».
 *
 * Плеером управляем только его открытым способом: `useMusicPlayer()` для
 * звука и событием `revealMusicPlayerCollapsed()` для полосы. Своего
 * состояния у кнопки нет.
 */
export function usePlayerHotkey() {
  const player = useMusicPlayer();
  const router = useRouter();

  const run = useCallback(async () => {
    const step = planPlayerHotkey(
      player
        ? { hasTrack: Boolean(player.current), isPlaying: player.isPlaying }
        : null,
    );
    // Пауза из шапки убирает полосу с экрана до следующего запуска (VED-482).
    if (step === "pause") {
      player?.toggle();
      stowMusicPlayer();
      return;
    }
    revealMusicPlayerCollapsed();
    if (step === "resume") {
      player?.toggle();
      return;
    }
    const saved = player ? restorePlan(await getPlaybackState()) : null;
    if (player && saved) {
      // Полоса смонтирована и без записи — свернуться она уже успела.
      player.play(saved.trackId, saved.queue, saved.positionSeconds);
      return;
    }
    router.push("/music");
  }, [player, router]);

  return { run, playing: Boolean(player?.current && player.isPlaying) };
}

/**
 * «Радио» (VED-502, VED-534): то же, что кнопка «Радио» в Медиатеке, —
 * включает радио не уводя со страницы, второе нажатие выключает. Радио
 * живёт в корневом layout рядом с плеером; если его там нет (тесты, окно
 * без провайдера), кнопка ведёт в Медиатеку, где радио есть всегда.
 */
export function useRadioHotkey() {
  const radio = useMusicRadio();
  const router = useRouter();

  const run = useCallback(() => {
    if (!radio) {
      router.push("/music");
      return;
    }
    if (radio.active) radio.stop();
    else radio.start();
  }, [radio, router]);

  return { run, active: Boolean(radio?.active) };
}
