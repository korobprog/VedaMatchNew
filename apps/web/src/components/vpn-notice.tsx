"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { apiBase } from "@/lib/api-base";
import {
  buildVpnProbeUrl,
  classifyVpnProbe,
  INITIAL_VPN_HINT_STATE,
  reduceVpnHint,
  VPN_PROBE_DELAY_MS,
  VPN_PROBE_INTERVAL_MS,
  VPN_PROBE_TIMEOUT_MS,
  type VpnHintState,
} from "@/lib/vpn-hint";

/**
 * Ключ закрытия. `sessionStorage`, а не `localStorage`: закрыл — не показываем
 * до конца этой вкладки, но в следующий раз человек про VPN уже не помнит, и
 * молчать навсегда значило бы оставить его один на один с неработающим
 * порталом.
 */
const DISMISS_KEY = "vm_vpn_hint_dismissed";

/** Закрывали ли плашку в этой вкладке. Приватный режим бросает — считаем «нет». */
function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Плашка «похоже, включён VPN» (VED-275) — на любой странице портала, потому
 * что живёт в корневом layout. Правила догадки и её причина — в
 * `lib/vpn-hint.ts`; здесь только проба, таймер и разметка.
 *
 * Внизу экрана, а не сверху: шапка — единственная навигация на телефоне, и
 * перекрывать её предупреждением нельзя. По той же причине плашка закрываемая.
 */
export function VpnNotice() {
  const [state, setState] = useState<VpnHintState>(INITIAL_VPN_HINT_STATE);
  // Читаем закрытие сразу в инициализаторе, а не в эффекте: гидратации это не
  // ломает — до первой удачной пробы плашки нет ни на сервере, ни в браузере,
  // и разметка первого кадра одинаковая при любом значении.
  const [dismissed, setDismissed] = useState(readDismissed);
  const probes = useRef(0);

  const probe = useCallback(async () => {
    probes.current += 1;
    let status: number | null = null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VPN_PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(buildVpnProbeUrl(apiBase(), probes.current), {
        cache: "no-store",
        signal: controller.signal,
      });
      status = res.status;
    } catch {
      // Сеть, CORS, таймаут — всё это «ответа нет». Разбираться, что именно,
      // из браузера нечем: подробности fetch не отдаёт.
    } finally {
      clearTimeout(timer);
    }
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    setState((prev) => reduceVpnHint(prev, classifyVpnProbe({ online, status })));
  }, []);

  useEffect(() => {
    let stopped = false;
    const run = () => {
      // Скрытая вкладка портал не открывает: незачем и проверять.
      if (stopped || document.visibilityState === "hidden") return;
      void probe();
    };
    const first = setTimeout(run, VPN_PROBE_DELAY_MS);
    const interval = setInterval(run, VPN_PROBE_INTERVAL_MS);
    // Возврат к вкладке — повод проверить сразу: человек мог как раз выключить
    // туннель и ждёт, что портал оживёт.
    document.addEventListener("visibilitychange", run);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", run);
    };
  }, [probe]);

  function dismiss() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Не запомнилось — плашка вернётся на следующей пробе. Не страшно.
    }
  }

  if (!state.warn || dismissed) return null;

  return (
    <div
      // pointer-events-none на обёртке: невидимая полоса поперёк экрана не
      // должна перехватывать клики по странице под ней.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-2xl border border-gold/50 bg-bg-1 p-4 text-left shadow-xl"
      >
        <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          {/* Не заголовок разметкой: плашка появляется поверх любой страницы и
              вклинилась бы в её порядок h1→h2→h3 для скринридера. */}
          <p className="font-display text-sm font-bold text-text-0">
            Похоже, включён VPN
          </p>
          <p className="mt-1 text-sm text-text-1">
            Портал не отвечает. С включённым VPN он не работает — отключите VPN
            и обновите страницу.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Закрыть предупреждение"
          className="shrink-0 rounded-lg p-1.5 text-text-1 transition-colors hover:bg-bg-2 hover:text-text-0"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
