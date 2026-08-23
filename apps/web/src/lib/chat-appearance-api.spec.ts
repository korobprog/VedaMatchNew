import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatColorTemplateDto } from "@vedamatch/shared";
import {
  createColorTemplate,
  deleteColorTemplate,
  getConversationTheme,
  listColorTemplates,
  setConversationTheme,
  updateColorTemplate,
} from "./chat-appearance-api";

afterEach(() => vi.unstubAllGlobals());

const template: ChatColorTemplateDto = {
  id: "tpl-1",
  name: "Синий",
  bubbleMine: "#23F0C7",
  bubbleTheirs: "#1A1A2E",
  accent: "#5CCCCC",
  background: "#0A0614",
  createdAt: "2026-08-23T10:00:00.000Z",
  updatedAt: "2026-08-23T10:00:00.000Z",
};

describe("chat-appearance-api", () => {
  it("запрашивает список шаблонов", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ templates: [template] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listColorTemplates();

    expect(result.templates).toEqual([template]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/chat/color-templates",
    );
  });

  it("создаёт шаблон POST-ом с телом", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(template), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const body = {
      name: "Синий",
      bubbleMine: "#23F0C7",
      bubbleTheirs: "#1A1A2E",
      accent: "#5CCCCC",
      background: "#0A0614",
    };
    await createColorTemplate(body);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/chat/color-templates",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  });

  it("редактирует шаблон по id", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(template), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateColorTemplate("tpl-1", {
      name: "Синий",
      bubbleMine: "#23F0C7",
      bubbleTheirs: "#1A1A2E",
      accent: "#5CCCCC",
      background: "#0A0614",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/chat/color-templates/tpl-1",
    );
  });

  it("удаляет шаблон", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await deleteColorTemplate("tpl-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/chat/color-templates/tpl-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("читает применённую тему беседы", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ templateId: "tpl-1" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getConversationTheme("conv-1")).resolves.toEqual({
      templateId: "tpl-1",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/chat/conversations/conv-1/theme",
    );
  });

  it("применяет шаблон к беседе", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ templateId: "tpl-1" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await setConversationTheme("conv-1", "tpl-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/chat/conversations/conv-1/theme",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ templateId: "tpl-1" }),
      }),
    );
  });
});
