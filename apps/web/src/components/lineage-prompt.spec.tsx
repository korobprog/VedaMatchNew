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
    expect(screen.getByRole("radio", { name: "Гаудия-матх" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Паривары" })).toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Сохранить" });
    expect(save).toBeDisabled();

    // Два шага (VED-568): группа, затем матх внутри неё.
    await user.click(screen.getByRole("radio", { name: "Гаудия-матх" }));
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
  it("первый шаг — группы: ISKCON одной строкой, без заголовков групп", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <LineageSelect value="" onChange={onChange} />,
    );
    const select = screen.getByRole("combobox", { name: "Духовная линия" });
    // Без строк-заголовков групп: Android показывает их отдельными
    // строками списка (VED-288).
    expect(select.querySelectorAll("optgroup")).toHaveLength(0);
    const options = Array.from(select.querySelectorAll("option")).filter(
      (option) => !option.disabled,
    );
    expect(options.map((option) => option.value)).toEqual([
      "iskcon",
      "gaudiya_math",
      "parivara",
    ]);
    // «ISKCON» в списке один раз (VED-568).
    expect(
      Array.from(select.querySelectorAll("option")).filter((option) =>
        option.textContent?.startsWith("ISKCON"),
      ),
    ).toHaveLength(1);
    expect(screen.queryByRole("option", { name: /Все/ })).not.toBeInTheDocument();
    // Второго шага без группы нет.
    expect(screen.getAllByRole("combobox")).toHaveLength(1);

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
    expect(labelled.querySelectorAll("option")).toHaveLength(5);
    expect(screen.getByRole("option", { name: "Все линии" })).toHaveValue("all");
  });

  it("ISKCON выбирается одним шагом", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LineageSelect value="" onChange={onChange} allLabel="Все линии" />);

    await user.selectOptions(screen.getByRole("combobox"), "iskcon");
    expect(onChange).toHaveBeenCalledWith("iskcon");
  });

  it("паривар — вторым шагом; до него значение не меняется", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LineageSelect value="iskcon" onChange={onChange} allLabel="Все линии" />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Духовная линия" }),
      "parivara",
    );
    expect(onChange).not.toHaveBeenCalled();
    const detail = screen.getByRole("combobox", {
      name: "Духовная линия: какой именно паривар",
    });
    expect(detail).toHaveValue("");
    await user.selectOptions(detail, "nityananda_vamsha");
    expect(onChange).toHaveBeenCalledWith("nityananda_vamsha");
  });

  it("стоящая линия показана группой и вторым списком", () => {
    render(<LineageSelect value="ipbys" onChange={vi.fn()} />);
    expect(
      screen.getByRole("combobox", { name: "Духовная линия" }),
    ).toHaveValue("gaudiya_math");
    expect(
      screen.getByRole("combobox", {
        name: "Духовная линия: какой именно матх",
      }),
    ).toHaveValue("ipbys");
  });

  it("в фильтре группа выбирается целиком, второй шаг её уточняет", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <LineageSelect value="" onChange={onChange} emptyLabel="Все" allowGroup />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "gaudiya_math");
    expect(onChange).toHaveBeenCalledWith("group:gaudiya_math");

    rerender(
      <LineageSelect
        value="group:gaudiya_math"
        onChange={onChange}
        emptyLabel="Все"
        allowGroup
      />,
    );
    const detail = screen.getByRole("combobox", {
      name: "Духовная линия: какой именно матх",
    });
    expect(detail).toHaveValue("group:gaudiya_math");
    expect(
      screen.getByRole("option", { name: "Любой Гаудия-матх" }),
    ).toBeInTheDocument();
  });
});

describe("LineageCards", () => {
  it("сначала группы, линии — после выбора группы", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LineageCards value="" onChange={onChange} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(
      screen.getByRole("radio", { name: /ISKCON.*сознания Кришны/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Гаудия-матх" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole("radio", { name: /IPBYS.*чистой бхакти-йоги/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(7);

    await user.click(screen.getByRole("radio", { name: /IPBYS/ }));
    expect(onChange).toHaveBeenCalledWith("ipbys");
  });

  it("ISKCON выбирается сразу", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LineageCards value="" onChange={onChange} />);
    await user.click(screen.getByRole("radio", { name: /ISKCON/ }));
    expect(onChange).toHaveBeenCalledWith("iskcon");
  });
});
