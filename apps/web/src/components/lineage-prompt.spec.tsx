import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LineagePrompt } from "./lineage-prompt";
import { LineageCards, LineageSelect } from "./lineage-picker";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe("LineagePrompt", () => {
  it("не показывается йогу: к нему деление на линии не относится", () => {
    const { container } = render(
      <LineagePrompt
        user={{ spiritualStage: "yogi", lineage: null }}
        serviceName="Музыки"
        settingsHref="/music/settings"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("не показывается преданному, у которого линия уже есть", () => {
    const { container } = render(
      <LineagePrompt
        user={{ spiritualStage: "devotee", lineage: "iskcon" }}
        serviceName="Музыки"
        settingsHref="/music/settings"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("преданному без линии предлагает весь список и пишет выбор в профиль", async () => {
    const user = userEvent.setup();
    render(
      <LineagePrompt
        user={{ spiritualStage: "devotee", lineage: null }}
        serviceName="Музыки"
        settingsHref="/music/settings"
        settingsLabel="в настройках Музыки"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "К какой линии вы принадлежите?" }),
    ).toBeInTheDocument();
    // Все три группы на одном экране: человек видит, что это ветви одного древа.
    expect(screen.getByText("Гаудия-матх")).toBeInTheDocument();
    expect(screen.getByText("Паривары")).toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Сохранить" });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Шри Чайтанья Сарасват Матх/ }));
    await user.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/profile");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      lineage: "sri_chaitanya_saraswat_math",
    });

    // После сохранения — подсказка, где менять дальше, и обновление страницы.
    expect(
      await screen.findByRole("link", { name: "в настройках Музыки" }),
    ).toHaveAttribute("href", "/music/settings");
    expect(refresh).toHaveBeenCalled();
  });
});

describe("LineageSelect", () => {
  it("группирует линии и показывает пустой вариант и «все» только по просьбе", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <LineageSelect value="" onChange={onChange} />,
    );
    const select = screen.getByRole("combobox", { name: "Духовная линия" });
    expect(select.querySelectorAll("optgroup")).toHaveLength(3);
    expect(screen.queryByRole("option", { name: /Все/ })).not.toBeInTheDocument();
    expect(select.querySelectorAll("option")).toHaveLength(10);

    rerender(
      <LineageSelect
        value=""
        onChange={onChange}
        emptyLabel="Как в профиле"
        allLabel="Все линии"
        label="Линия"
      />,
    );
    const labelled = screen.getByRole("combobox", { name: "Линия" });
    expect(labelled.querySelectorAll("option")).toHaveLength(12);
    expect(screen.getByRole("option", { name: "Все линии" })).toHaveValue("all");
  });

  it("отдаёт выбранное значение строкой", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LineageSelect value="" onChange={onChange} allLabel="Все линии" />);

    await user.selectOptions(screen.getByRole("combobox"), "nityananda_vamsha");
    expect(onChange).toHaveBeenCalledWith("nityananda_vamsha");
  });
});

describe("LineageCards", () => {
  it("расшифровывает аббревиатуры рядом с названием", () => {
    render(<LineageCards value="" onChange={vi.fn()} />);
    expect(
      screen.getByRole("radio", { name: /IPBYS.*чистой бхакти-йоги/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(10);
  });
});
