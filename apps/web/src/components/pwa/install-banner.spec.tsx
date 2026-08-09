import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstallBanner } from "./install-banner";
import { useInstallPrompt } from "./use-install-prompt";

vi.mock("./use-install-prompt", () => ({
  useInstallPrompt: vi.fn(),
}));

const promptInstall = vi.fn();

function mockMode(mode: string) {
  vi.mocked(useInstallPrompt).mockReturnValue({
    mode: mode as never,
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
    mockMode("ios-manual");
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
});
