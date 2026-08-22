import { render as renderRaw, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CityPicker } from "./city-picker";
import ru from "../../messages/ru.json";

/** Компонент берёт локаль из next-intl: она уезжает в геокодер как `lang`. */
const render = (ui: ReactElement) =>
  renderRaw(
    <NextIntlClientProvider locale="ru" messages={ru}>
      {ui}
    </NextIntlClientProvider>,
  );

const MAYAPUR = {
  city: "Mayapur",
  country: "Индия",
  lat: 23.4234,
  lon: 88.3908,
  displayName: "Mayapur, Nabadwip, Nadia, Западная Бенгалия, 741313, Индия",
};

const VRINDAVAN = {
  city: "Вриндавана",
  country: "Индия",
  lat: 27.5806,
  lon: 77.7006,
  displayName: "Вриндавана, Mathura, Уттар-Прадеш, 281121, Индия",
};

function stubGeo(results: unknown[]) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Поиск города молчал на любой неудаче: «Маяпур» кириллицей возвращал пустой
 * список, и человек видел ровно то же, что при сломанном сервере — ничего.
 */
describe("CityPicker — ответ геокодера", () => {
  it("пустой ответ объясняется, а не молчит", async () => {
    const user = userEvent.setup();
    stubGeo([]);
    render(<CityPicker value={null} onChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Поиск города"), "Маяпур");

    expect(await screen.findByText(/Ничего не нашлось/)).toBeInTheDocument();
  });

  it("язык интерфейса уезжает в геокодер: названия приходят по-русски", async () => {
    const user = userEvent.setup();
    const fetchMock = stubGeo([]);
    render(<CityPicker value={null} onChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Поиск города"), "Маяпур");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("lang=ru");
  });

  it("быстрая подсказка сама запускает поиск святого места", async () => {
    const user = userEvent.setup();
    const fetchMock = stubGeo([MAYAPUR]);
    render(<CityPicker value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Маяпур" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(decodeURIComponent(String(fetchMock.mock.calls[0][0]))).toContain(
      "q=Маяпур",
    );
    expect(
      await screen.findByRole("option", { name: /Mayapur, Индия/ }),
    ).toBeInTheDocument();
  });

  it("нечего очищать — кнопка «Очистить город» выключена", () => {
    render(<CityPicker value={null} onChange={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Очистить город" }),
    ).toBeDisabled();
  });
});

/**
 * До паттерна combobox список был набором кнопок: стрелки не работали, а
 * добраться до подсказки можно было только табом сквозь весь список. Эти
 * тесты держат клавиатуру целиком — на неё завязан и скринридер.
 */
describe("CityPicker — клавиатура", () => {
  async function openList(results: unknown[]) {
    const user = userEvent.setup();
    stubGeo(results);
    const onChange = vi.fn();
    render(<CityPicker value={null} onChange={onChange} />);
    const input = screen.getByLabelText("Поиск города");
    await user.type(input, "Маяпур");
    await screen.findAllByRole("option");
    return { user, input, onChange };
  }

  it("до ввода список закрыт", () => {
    render(<CityPicker value={null} onChange={vi.fn()} />);

    expect(screen.getByLabelText("Поиск города")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("стрелка вниз подсвечивает первый вариант, Enter его выбирает", async () => {
    const { user, input, onChange } = await openList([MAYAPUR, VRINDAVAN]);

    await user.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(MAYAPUR);
  });

  it("стрелка вверх с закрытого списка заходит с конца", async () => {
    const { user } = await openList([MAYAPUR, VRINDAVAN]);

    await user.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("подсветка ходит по кругу", async () => {
    const { user } = await openList([MAYAPUR, VRINDAVAN]);

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  // Enter без подсветки раньше отправлял всю форму профиля, ещё не дождавшись
  // подсказок: человек «сохранял» профиль вместо выбора города.
  it("Enter без подсветки ничего не выбирает и не всплывает в форму", async () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const onChange = vi.fn();
    const user = userEvent.setup();
    stubGeo([MAYAPUR]);
    renderRaw(
      <NextIntlClientProvider locale="ru" messages={ru}>
        <form onSubmit={submit}>
          <CityPicker value={null} onChange={onChange} />
        </form>
      </NextIntlClientProvider>,
    );

    await user.type(screen.getByLabelText("Поиск города"), "Маяпур{Enter}");

    expect(onChange).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("Escape закрывает список, не стирая набранное", async () => {
    const { user, input } = await openList([MAYAPUR]);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(input).toHaveValue("Маяпур");
  });
});
