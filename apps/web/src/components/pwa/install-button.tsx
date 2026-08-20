"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInstallPrompt } from "./use-install-prompt";
import { IosInstallInstructions } from "./ios-install-instructions";
import { WrongBrowserInstructions } from "./wrong-browser-instructions";

export function InstallButton({ className }: { className?: string }) {
  const { mode, browser, platform, promptInstall } = useInstallPrompt();
  const [showInstructions, setShowInstructions] = useState(false);

  if (mode === "installed" || mode === "unsupported") return null;

  const wrongBrowser = mode === "wrong-browser";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (mode === "can-prompt") void promptInstall();
          else setShowInstructions(true);
        }}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl border border-glass-brd px-4 py-3 text-sm font-medium text-text-1 transition hover:text-text-0",
          className,
        )}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {wrongBrowser
          ? `Установить через ${platform === "ios" ? "Safari" : "Chrome"}`
          : "Установить приложение"}
      </button>
      {showInstructions &&
        (wrongBrowser ? (
          <WrongBrowserInstructions
            browser={browser}
            platform={platform}
            onClose={() => setShowInstructions(false)}
          />
        ) : (
          <IosInstallInstructions onClose={() => setShowInstructions(false)} />
        ))}
    </>
  );
}
