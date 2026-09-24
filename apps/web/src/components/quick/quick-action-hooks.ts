"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { RewardsMeDto } from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";
import { copyText } from "@/lib/copy-text";
import { useServiceNames } from "@/components/service-catalog-provider";
import { portalLocationLabels, portalLocationTitle } from "@/lib/portal-location";
import {
  nextPortalWindow,
  portalWindowButtonHint,
  portalWindowTargetUrl,
} from "@/lib/portal-windows";
import { getPlaybackState } from "@/lib/music-playback-api";
import { useMusicPlayer } from "@/components/music/player/player-provider";
import { revealMusicPlayerCollapsed } from "@/components/music/player/player-reveal";
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

/**
 * Ссылка-приглашение в буфер, не уводя со страницы: за ней и приходят —
 * скинуть другу в мессенджер. Полный текст приглашения остаётся в «Баллах»,
 * его собирает сервер из каталога сервисов.
 */
export function useInviteCopy() {
  const [state, setState] = useState<InviteCopyState>("idle");

  const copy = useCallback(async () => {
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
  }, []);

  return { state, copy };
}

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
    revealMusicPlayerCollapsed();
    const step = planPlayerHotkey(
      player
        ? { hasTrack: Boolean(player.current), isPlaying: player.isPlaying }
        : null,
    );
    if (step === "pause" || step === "resume") {
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
