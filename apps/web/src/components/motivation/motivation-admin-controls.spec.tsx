import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MotivationAdminPostDto } from "@vedamatch/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MotivationAdminControls } from "./motivation-admin-controls";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const post: MotivationAdminPostDto = { id: "post-1", slug: "daily-post", contentDate: "2026-07-12", profileType: "devotee", audienceTrack: "universal", category: "daily", imageUrl: "", storyImageUrl: "", title: "Пост", text: "Текст", storyText: "История", attributionKind: "ai_reflection", attributionSpeaker: null, attributionWork: null, attributionLocator: null, attributionSourceUrl: null, sourceVerified: false, publishedAt: "", isFavorite: false, isViewed: false, status: "failed", generationStage: "failed", generationErrorCode: "provider_error", attemptCount: 3 };

describe("MotivationAdminControls", () => {
  beforeEach(() => { refresh.mockReset(); vi.unstubAllGlobals(); });

  it("starts today's batch and refreshes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<MotivationAdminControls posts={[post]} />);
    await user.click(screen.getByRole("button", { name: "Сгенерировать на сегодня" }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/admin\/motivation\/generate$/), expect.objectContaining({ method: "POST", credentials: "include", body: "{}" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("regenerates one post and shows diagnostics", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<MotivationAdminControls posts={[post]} />);
    expect(screen.getByText(/Ошибка · этап: failed · попыток: 3/)).toBeInTheDocument();
    expect(screen.getByText("provider_error")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Перегенерировать" }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/admin\/motivation\/posts\/post-1\/regenerate$/), expect.objectContaining({ method: "POST", credentials: "include" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});
