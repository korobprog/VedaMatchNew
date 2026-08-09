"use client";

import { useCallback, useEffect, useState } from "react";
import {
  detectInstallMode,
  type BeforeInstallPromptEvent,
  type InstallMode,
} from "@/lib/pwa/platform";
import {
  clearCapturedInstallPrompt,
  readCapturedInstallPrompt,
} from "@/lib/pwa/prompt-capture";

type InstallNavigator = Navigator & { standalone?: boolean };

export function useInstallPrompt(): {
  mode: InstallMode;
  promptInstall: () => Promise<void>;
} {
  // На сервере режим неизвестен — «unsupported» ничего не рисует, поэтому
  // разметка сервера и первого рендера совпадают.
  const [mode, setMode] = useState<InstallMode>("unsupported");
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function resolve(event: BeforeInstallPromptEvent | null) {
      setPromptEvent(event);
      setMode(
        detectInstallMode({
          matchMedia: (query) => window.matchMedia(query),
          navigator: window.navigator as InstallNavigator,
          promptEvent: event,
        }),
      );
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

  return { mode, promptInstall };
}
