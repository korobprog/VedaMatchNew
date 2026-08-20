"use client";

import { useCallback, useEffect, useState } from "react";
import type { PwaBrowserFamily, PwaPlatform } from "@vedamatch/shared";
import {
  detectInstallState,
  type BeforeInstallPromptEvent,
  type InstallMode,
} from "@/lib/pwa/platform";
import {
  clearCapturedInstallPrompt,
  readCapturedInstallPrompt,
} from "@/lib/pwa/prompt-capture";

type InstallNavigator = Navigator & { standalone?: boolean };

export interface InstallPrompt {
  mode: InstallMode;
  /** Нужны диалогу «wrong-browser»: совет для Android и для iOS разный. */
  browser: PwaBrowserFamily;
  platform: PwaPlatform;
  promptInstall: () => Promise<void>;
}

export function useInstallPrompt(): InstallPrompt {
  // На сервере режим неизвестен — «unsupported» ничего не рисует, поэтому
  // разметка сервера и первого рендера совпадают.
  const [mode, setMode] = useState<InstallMode>("unsupported");
  const [browser, setBrowser] = useState<PwaBrowserFamily>("other");
  const [platform, setPlatform] = useState<PwaPlatform>("desktop");
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function resolve(event: BeforeInstallPromptEvent | null) {
      setPromptEvent(event);
      const state = detectInstallState({
        matchMedia: (query) => window.matchMedia(query),
        navigator: window.navigator as InstallNavigator,
        promptEvent: event,
      });
      setMode(state.mode);
      setBrowser(state.browser);
      setPlatform(state.platform);
    }

    resolve(readCapturedInstallPrompt());

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      resolve(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      clearCapturedInstallPrompt();
      setPromptEvent(null);
      setMode("installed");
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // Событие одноразовое: повторный prompt() бросит исключение.
    clearCapturedInstallPrompt();
    setPromptEvent(null);
    if (outcome === "accepted") setMode("installed");
  }, [promptEvent]);

  return { mode, browser, platform, promptInstall };
}
