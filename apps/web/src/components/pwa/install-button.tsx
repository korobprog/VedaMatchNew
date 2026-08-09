"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInstallPrompt } from "./use-install-prompt";
import { IosInstallInstructions } from "./ios-install-instructions";

export function InstallButton({ className }: { className?: string }) {
  const { mode, promptInstall } = useInstallPrompt();
  const [showInstructions, setShowInstructions] = useState(false);

  if (mode === "installed" || mode === "unsupported") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (mode === "ios-manual") setShowInstructions(true);
          else void promptInstall();
        }}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl border border-glass-brd px-4 py-3 text-sm font-medium text-text-1 transition hover:text-text-0",
          className,
        )}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Установить приложение
      </button>
      {showInstructions && (
        <IosInstallInstructions onClose={() => setShowInstructions(false)} />
      )}
    </>
  );
}
