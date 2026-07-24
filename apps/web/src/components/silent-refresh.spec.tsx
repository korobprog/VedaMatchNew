import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SilentRefresh } from "./silent-refresh";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

describe("SilentRefresh", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    vi.restoreAllMocks();
  });

  it("restores the session and returns to the requested page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    render(<SilentRefresh returnTo="/union?tab=matches" />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/union?tab=matches");
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("stays on the landing page when refresh is rejected", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    render(<SilentRefresh returnTo="/union" />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledOnce());
    expect(replace).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each(["//malicious.example", "/\\malicious.example"])(
    "rejects an external return destination: %s",
    async (returnTo) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 200 }),
      );

      render(<SilentRefresh returnTo={returnTo} />);

      await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    },
  );
});
