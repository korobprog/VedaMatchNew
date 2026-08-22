import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PwaBrowserFamily, PwaPlatform } from "@vedamatch/shared";
import { InstallBanner } from "./install-banner";
import { useInstallPrompt } from "./use-install-prompt";

vi.mock("./use-install-prompt", () => ({
  useInstallPrompt: vi.fn(),
}));

const promptInstall = vi.fn();

function mockMode(
  mode: string,
  browser: PwaBrowserFamily = "chrome",
  platform: PwaPlatform = "android",
) {
  vi.mocked(useInstallPrompt).mockReturnValue({
    mode: mode as never,
    browser,
    platform,
    promptInstall,
  });
}

describe("InstallBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    promptInstall.mockReset();
  });

  it("offers the system dialog when the browser supports it", async () => {
    mockMode("can-prompt");
    render(<InstallBanner />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Установить" }),
    );

    expect(promptInstall).toHaveBeenCalledOnce();
  });

  it("opens manual instructions on iOS instead of a dialog", async () => {
    mockMode("ios-manual", "safari", "ios");
    render(<InstallBanner />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Установить" }),
    );

    expect(promptInstall).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("stays away once installed", () => {
    mockMode("installed");
    render(<InstallBanner />);

    expect(screen.queryByRole("button", { name: "Установить" })).toBeNull();
  });

  it("does not come back after the user closes it", async () => {
    mockMode("can-prompt");
    const first = render(<InstallBanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Закрыть" }));
    first.unmount();

    render(<InstallBanner />);

    expect(screen.queryByRole("button", { name: "Установить" })).toBeNull();
  });

  it("never calls the system dialog in Yandex Browser: it would make a shortcut", async () => {
    mockMode("wrong-browser", "yandex-browser", "android");
    render(<InstallBanner />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Как установить" }),
    );

    expect(promptInstall).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: /через Chrome/ }),
    ).toBeInTheDocument();
  });

  it("explains the browser menu when Chrome on Android sent no event", async () => {
    mockMode("android-manual", "chrome", "android");
    render(<InstallBanner />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Как установить" }),
    );

    expect(promptInstall).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: /на Android/ }),
    ).toBeInTheDocument();
  });

  it("points iOS users of a non-Safari browser at Safari", async () => {
    mockMode("wrong-browser", "yandex-browser", "ios");
    render(<InstallBanner />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Как установить" }),
    );

    expect(
      screen.getByRole("dialog", { name: /через Safari/ }),
    ).toBeInTheDocument();
  });
});
