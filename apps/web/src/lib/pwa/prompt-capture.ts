import type { BeforeInstallPromptEvent } from "./platform";

export const installPromptGlobalKey = "__vedamatchInstallPrompt";

// Chrome шлёт beforeinstallprompt один раз и рано — иногда до гидратации.
// Слушатель из useEffect его пропустит, поэтому ловим строкой скрипта,
// которую layout подключает со стратегией beforeInteractive.
export const installPromptCaptureScript = `window.addEventListener("beforeinstallprompt",function(event){event.preventDefault();window.${installPromptGlobalKey}=event;});`;

export function readCapturedInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  const captured = (window as unknown as Record<string, unknown>)[
    installPromptGlobalKey
  ];
  return (captured as BeforeInstallPromptEvent | undefined) ?? null;
}

export function clearCapturedInstallPrompt(): void {
  if (typeof window === "undefined") return;
  delete (window as unknown as Record<string, unknown>)[installPromptGlobalKey];
}
