import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PostcardButton } from "./postcard-button";

const event = {
  id: "e1",
  date: "2026-08-20",
  title: "Джанмаштами",
  greeting: "С Джанмаштами",
  leadDays: 3,
  enabled: true,
};

describe("PostcardButton", () => {
  it("stays hidden when there is no occasion and no postcard yet", () => {
    const { container } = render(<PostcardButton postId="p1" event={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the occasion and turns into a download after building", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: "https://cdn/postcard.png", greeting: "С Джанмаштами" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PostcardButton postId="p1" event={event} />);

    await user.click(screen.getByRole("button", { name: /Сделать открытку · Джанмаштами/ }));

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Скачать открытку/ })).toHaveAttribute(
        "href",
        "https://cdn/postcard.png",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/motivation/posts/p1/postcard"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("offers the download straight away when the postcard exists", () => {
    render(<PostcardButton postId="p1" event={null} existingUrl="https://cdn/old.png" />);
    expect(screen.getByRole("link", { name: /Скачать открытку/ })).toBeInTheDocument();
  });

  it("shows the server message when building fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: "Нет повода для открытки" }),
      }),
    );
    const user = userEvent.setup();
    render(<PostcardButton postId="p1" event={event} />);

    await user.click(screen.getByRole("button", { name: /Сделать открытку/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Нет повода для открытки");
  });
});
