export type InstallMode =
  | "installed"
  | "can-prompt"
  | "ios-manual"
  | "unsupported";

// Событие нестандартное: его шлёт только Chromium, в lib.dom оно отсутствует.
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallEnvironment {
  matchMedia: (query: string) => { matches: boolean };
  navigator: { standalone?: boolean; userAgent: string };
  promptEvent: BeforeInstallPromptEvent | null;
}

export function isIos(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent);
}

export function detectInstallMode(
  environment: InstallEnvironment,
): InstallMode {
  const standalone =
    environment.matchMedia("(display-mode: standalone)").matches ||
    environment.navigator.standalone === true;
  if (standalone) return "installed";
  if (environment.promptEvent) return "can-prompt";
  // На iOS beforeinstallprompt не существует ни в одном браузере — там
  // установка только вручную через меню «Поделиться».
  if (isIos(environment.navigator.userAgent)) return "ios-manual";
  return "unsupported";
}
