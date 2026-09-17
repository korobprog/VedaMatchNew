import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAdminCommand } from "./use-admin-command";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("../motivation-admin-api", () => ({ apiRequest }));

/**
 * VED-251, круг 2: покрытие для ветки `ok`/`errors` отдельно от компонентов,
 * которые её используют (`published-list.spec.tsx` проверяет только то, что
 * видно на экране). Здесь — сам хук: что именно он возвращает и кладёт в
 * `errors`/`pending`.
 */
describe("useAdminCommand", () => {
  it("возвращает true и обновляет страницу при успехе", async () => {
    apiRequest.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useAdminCommand());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.run("post-1", "hide", {
        path: "/admin/motivation/posts/post-1",
        method: "PATCH",
        body: { hidden: true },
      });
    });

    expect(ok).toBe(true);
    expect(apiRequest).toHaveBeenCalledWith(
      "/admin/motivation/posts/post-1",
      "PATCH",
      { hidden: true },
    );
    expect(refresh).toHaveBeenCalled();
    expect(result.current.errors["post-1"]).toBeUndefined();
    expect(result.current.pending["post-1"]).toBeUndefined();
  });

  it("возвращает false и кладёт сообщение об ошибке в errors, не бросая исключение", async () => {
    apiRequest.mockRejectedValueOnce(new Error("Сервер недоступен"));
    const { result } = renderHook(() => useAdminCommand());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.run("post-1", "hide", {
        path: "/admin/motivation/posts/post-1",
        method: "PATCH",
        body: { hidden: true },
      });
    });

    expect(ok).toBe(false);
    expect(result.current.errors["post-1"]).toBe("Сервер недоступен");
    expect(result.current.pending["post-1"]).toBeUndefined();
  });

  it("до ответа сервера помечает команду как pending под её ключом", async () => {
    let resolveRequest: (() => void) | undefined;
    apiRequest.mockReturnValueOnce(
      new Promise<null>((resolve) => {
        resolveRequest = () => resolve(null);
      }),
    );
    const { result } = renderHook(() => useAdminCommand());

    let runPromise!: Promise<boolean>;
    act(() => {
      runPromise = result.current.run("post-1", "hide", {
        path: "/admin/motivation/posts/post-1",
        method: "PATCH",
        body: { hidden: true },
      });
    });

    await waitFor(() => expect(result.current.pending["post-1"]).toBe("hide"));

    resolveRequest?.();
    await act(async () => {
      await runPromise;
    });

    expect(result.current.pending["post-1"]).toBeUndefined();
  });

  it("новый запуск по тому же ключу снимает прошлую ошибку", async () => {
    apiRequest.mockRejectedValueOnce(new Error("Сбой сети"));
    const { result } = renderHook(() => useAdminCommand());

    await act(async () => {
      await result.current.run("post-1", "hide", {
        path: "/admin/motivation/posts/post-1",
        method: "PATCH",
      });
    });
    expect(result.current.errors["post-1"]).toBe("Сбой сети");

    apiRequest.mockResolvedValueOnce(null);
    await act(async () => {
      await result.current.run("post-1", "hide", {
        path: "/admin/motivation/posts/post-1",
        method: "PATCH",
      });
    });

    expect(result.current.errors["post-1"]).toBeUndefined();
  });
});
