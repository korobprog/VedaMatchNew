import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstallEnvironmentBeacon } from "./install-environment-beacon";
import { reportInstallEnvironment } from "@/lib/telemetry-api";

vi.mock("@/lib/telemetry-api", () => ({
  reportInstallEnvironment: vi.fn().mockResolvedValue(undefined),
}));

const yandexAndroid =
  "Mozilla/5.0 (Linux; arm_64; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 YaBrowser/23.1.2.86.00 SA/3 Mobile Safari/537.36";

describe("InstallEnvironmentBeacon", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(reportInstallEnvironment).mockClear();
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: yandexAndroid,
    });
  });

  it("отправляет замер окружения при первом открытии вкладки", () => {
    render(<InstallEnvironmentBeacon />);

    expect(reportInstallEnvironment).toHaveBeenCalledWith({
      browser: "yandex-browser",
      platform: "android",
      displayMode: "browser",
      standaloneCapable: false,
    });
  });

  it("не шлёт замер повторно при переходе на другую страницу портала", () => {
    render(<InstallEnvironmentBeacon />).unmount();
    render(<InstallEnvironmentBeacon />);

    expect(reportInstallEnvironment).toHaveBeenCalledTimes(1);
  });

  it("ничего не рисует", () => {
    const { container } = render(<InstallEnvironmentBeacon />);

    expect(container).toBeEmptyDOMElement();
  });
});
