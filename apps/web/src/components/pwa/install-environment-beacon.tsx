"use client";

import { useEffect } from "react";
import { buildInstallEnvironmentReport } from "@/lib/pwa/install-environment";
import { reportInstallEnvironment } from "@/lib/telemetry-api";

/** Один замер на вкладку: срез нужен по людям, а не по числу переходов. */
const sessionKey = "pwa:environment-reported";

export function InstallEnvironmentBeacon() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(sessionKey) === "1") return;
      window.sessionStorage.setItem(sessionKey, "1");
    } catch {
      // Приватный режим не даёт запомнить — замер уйдёт ещё раз, и это
      // безобидно: строка на человека одна, upsert её перезапишет.
    }

    const report = buildInstallEnvironmentReport({
      userAgent: window.navigator.userAgent,
      matchMedia: (query) => window.matchMedia(query),
      navigatorStandalone: (window.navigator as { standalone?: boolean })
        .standalone,
    });
    void reportInstallEnvironment(report);
  }, []);

  return null;
}
