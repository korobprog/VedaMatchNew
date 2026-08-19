import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDonationForm } from "./admin-donation-form";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  refresh.mockClear();
});

describe("AdminDonationForm", () => {
  it("adds a requisite row and sends the whole form", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AdminDonationForm initial={{ enabled: false, text: "", requisites: [] }} />);

    await user.click(screen.getByRole("checkbox", { name: /Показывать кнопку/ }));
    await user.click(screen.getByRole("button", { name: "+ Добавить реквизит" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Вид реквизита 1" }), "card");
    await user.type(screen.getByRole("textbox", { name: "Подпись реквизита 1" }), "Карта");
    await user.type(screen.getByRole("textbox", { name: "Значение реквизита 1" }), "2200 0000 0000 1234");
    await user.click(screen.getByRole("button", { name: "Сохранить реквизиты" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/admin/billing/donation");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      enabled: true,
      text: "",
      requisites: [{ kind: "card", label: "Карта", value: "2200 0000 0000 1234" }],
    });
    await waitFor(() => expect(screen.getByText("Сохранено")).toBeInTheDocument());
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the server validation message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: "Реквизит 1: подпись от 1 до 60 символов" }),
      }),
    );
    const user = userEvent.setup();
    render(
      <AdminDonationForm
        initial={{ enabled: true, text: "", requisites: [{ kind: "sbp", label: "", value: "+7" }] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Сохранить реквизиты" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Реквизит 1: подпись от 1 до 60 символов");
  });

  it("removes a row", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    render(
      <AdminDonationForm
        initial={{ enabled: true, text: "", requisites: [{ kind: "sbp", label: "СБП", value: "+7" }] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Удалить реквизит 1" }));

    expect(screen.queryByRole("textbox", { name: "Подпись реквизита 1" })).not.toBeInTheDocument();
    expect(screen.getByText("Пока ни одного — добавьте строку.")).toBeInTheDocument();
  });
});
