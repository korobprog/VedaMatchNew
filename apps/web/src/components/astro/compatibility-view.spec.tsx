import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AstroCompatibilityRequestDto, GunaMilanScore } from "@vedamatch/shared";
import { CompatibilityView } from "./compatibility-view";
import * as clientApi from "@/lib/astro-client-api";

const score = (): GunaMilanScore => ({
  totalPoints: 27,
  maxPoints: 36,
  percent: 75,
  kootas: [
    { key: "nadi", title: "Жизненная энергия", points: 8, maxPoints: 8, note: "" },
    { key: "bhakoot", title: "Совместимость знаков", points: 7, maxPoints: 7, note: "" },
  ],
});

const request = (
  overrides: Partial<AstroCompatibilityRequestDto> = {},
): AstroCompatibilityRequestDto => ({
  id: "req-1",
  status: "pending",
  createdAt: "2026-08-10T00:00:00.000Z",
  respondedAt: null,
  isRequester: false,
  score: null,
  counterpart: { userId: "u2", name: "Радха", avatarUrl: null },
  ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe("CompatibilityView", () => {
  it("показывает пустое состояние без запросов", async () => {
    vi.spyOn(clientApi, "listAstroCompatibilityRequests").mockResolvedValue([]);
    render(<CompatibilityView autoRequestUserId={null} />);
    expect(await screen.findByText(/пока нет/)).toBeInTheDocument();
  });

  it("показывает входящий запрос с кнопками принять/отклонить", async () => {
    vi.spyOn(clientApi, "listAstroCompatibilityRequests").mockResolvedValue([
      request({ isRequester: false, status: "pending" }),
    ]);
    render(<CompatibilityView autoRequestUserId={null} />);

    expect(await screen.findByText("Радха")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Принять" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отклонить" })).toBeInTheDocument();
  });

  it("принятие запроса отправляет accept:true и перечитывает список", async () => {
    vi.spyOn(clientApi, "listAstroCompatibilityRequests")
      .mockResolvedValueOnce([request()])
      .mockResolvedValueOnce([request({ status: "accepted", score: score() })]);
    const respond = vi
      .spyOn(clientApi, "respondAstroCompatibilityRequest")
      .mockResolvedValue(request({ status: "accepted" }));

    render(<CompatibilityView autoRequestUserId={null} />);
    await userEvent.click(await screen.findByRole("button", { name: "Принять" }));

    expect(respond).toHaveBeenCalledWith("req-1", true);
    expect(await screen.findByText(/27 из 36/)).toBeInTheDocument();
  });

  it("для принятого запроса сразу видны очки, без обращения к ИИ", async () => {
    vi.spyOn(clientApi, "listAstroCompatibilityRequests").mockResolvedValue([
      request({ status: "accepted", score: score() }),
    ]);
    const reading = vi.spyOn(clientApi, "generateAstroCompatibilityReading");

    render(<CompatibilityView autoRequestUserId={null} />);

    expect(await screen.findByText(/27 из 36 \(75%\)/)).toBeInTheDocument();
    expect(screen.getByText("Жизненная энергия")).toBeInTheDocument();
    expect(reading).not.toHaveBeenCalled();
  });

  it("разбор запрашивается только по клику на кнопку", async () => {
    vi.spyOn(clientApi, "listAstroCompatibilityRequests").mockResolvedValue([
      request({ status: "accepted", score: score() }),
    ]);
    vi.spyOn(clientApi, "generateAstroCompatibilityReading").mockResolvedValue({
      text: "Ваши Луны говорят о взаимном тепле",
      available: true,
      blockedBy: null,
    });

    render(<CompatibilityView autoRequestUserId={null} />);
    await userEvent.click(await screen.findByRole("button", { name: "Прочитать разбор" }));

    expect(
      await screen.findByText("Ваши Луны говорят о взаимном тепле"),
    ).toBeInTheDocument();
  });

  it("исчерпанная квота не прячет уже показанные очки", async () => {
    vi.spyOn(clientApi, "listAstroCompatibilityRequests").mockResolvedValue([
      request({ status: "accepted", score: score() }),
    ]);
    vi.spyOn(clientApi, "generateAstroCompatibilityReading").mockResolvedValue({
      text: null,
      available: false,
      blockedBy: "quota_exhausted",
    });

    render(<CompatibilityView autoRequestUserId={null} />);
    await userEvent.click(await screen.findByRole("button", { name: "Прочитать разбор" }));

    expect(await screen.findByText(/квота разборов исчерпана/)).toBeInTheDocument();
    expect(screen.getByText(/27 из 36/)).toBeInTheDocument();
  });

  it("список ожидающих ответа отдельно от входящих", async () => {
    vi.spyOn(clientApi, "listAstroCompatibilityRequests").mockResolvedValue([
      request({ isRequester: true, status: "pending", counterpart: { userId: "u3", name: "Кришна", avatarUrl: null } }),
    ]);
    render(<CompatibilityView autoRequestUserId={null} />);

    expect(await screen.findByText("Ожидают ответа")).toBeInTheDocument();
    expect(screen.getByText("Кришна")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Принять" })).not.toBeInTheDocument();
  });

  it("автозапрос из карточки Union отправляется один раз, если такого запроса ещё нет", async () => {
    vi.spyOn(clientApi, "listAstroCompatibilityRequests")
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([request({ isRequester: true, counterpart: { userId: "u9", name: "Гита", avatarUrl: null } })]);
    const create = vi
      .spyOn(clientApi, "createAstroCompatibilityRequest")
      .mockResolvedValue(request({ isRequester: true }));

    render(<CompatibilityView autoRequestUserId="u9" />);

    await waitFor(() => expect(create).toHaveBeenCalledWith("u9"));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("не дублирует автозапрос, если он уже есть в списке", async () => {
    vi.spyOn(clientApi, "listAstroCompatibilityRequests").mockResolvedValue([
      request({ isRequester: true, counterpart: { userId: "u9", name: "Гита", avatarUrl: null } }),
    ]);
    const create = vi.spyOn(clientApi, "createAstroCompatibilityRequest");

    render(<CompatibilityView autoRequestUserId="u9" />);
    await screen.findByText("Гита");

    expect(create).not.toHaveBeenCalled();
  });

  it("ошибка загрузки показывается пользователю", async () => {
    vi.spyOn(clientApi, "listAstroCompatibilityRequests").mockRejectedValue(
      new clientApi.AstroReadingError("Сервер недоступен", 503),
    );
    render(<CompatibilityView autoRequestUserId={null} />);
    expect(await screen.findByText("Сервер недоступен")).toBeInTheDocument();
  });
});
