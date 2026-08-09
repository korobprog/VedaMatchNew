import { describe, expect, it } from "vitest";
import {
  detectInstallMode,
  type BeforeInstallPromptEvent,
  type InstallEnvironment,
} from "./platform";

const androidChrome =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const iphoneSafari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1";
const desktopFirefox =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";

function environment(
  overrides: Partial<InstallEnvironment>,
): InstallEnvironment {
  return {
    matchMedia: () => ({ matches: false }),
    navigator: { userAgent: desktopFirefox },
    promptEvent: null,
    ...overrides,
  };
}

const promptEvent = {} as BeforeInstallPromptEvent;

describe("detectInstallMode", () => {
  it("reports an installed app when it runs in a standalone window", () => {
    expect(
      detectInstallMode(
        environment({
          matchMedia: (query) => ({ matches: query.includes("standalone") }),
          navigator: { userAgent: androidChrome },
          promptEvent,
        }),
      ),
    ).toBe("installed");
  });

  it("reports an installed app on iOS via navigator.standalone", () => {
    expect(
      detectInstallMode(
        environment({
          navigator: { userAgent: iphoneSafari, standalone: true },
        }),
      ),
    ).toBe("installed");
  });

  it("offers the system dialog when a prompt event was captured", () => {
    expect(
      detectInstallMode(
        environment({ navigator: { userAgent: androidChrome }, promptEvent }),
      ),
    ).toBe("can-prompt");
  });

  it("falls back to manual instructions on iOS, which has no prompt event", () => {
    expect(
      detectInstallMode(environment({ navigator: { userAgent: iphoneSafari } })),
    ).toBe("ios-manual");
  });

  it("stays silent where installation is not available", () => {
    expect(detectInstallMode(environment({}))).toBe("unsupported");
  });
});
