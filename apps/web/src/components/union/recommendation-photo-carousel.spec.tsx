import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOPLAY_IDLE_MS, AUTOPLAY_STEP_MS } from "./photo-autoplay";
import type { UnionPhoto } from "@vedamatch/shared";
import { RecommendationPhotoCarousel } from "./recommendation-photo-carousel";

const photos: UnionPhoto[] = [
  { id: "photo-1", url: "https://example.com/one.webp", width: 1200, height: 800 },
  { id: "photo-2", url: "https://example.com/two.webp", width: 800, height: 1200 },
  { id: "photo-3", url: "https://example.com/three.webp", width: 1000, height: 1000 },
];

describe("RecommendationPhotoCarousel", () => {
  it("preserves photo order and supports accessible arrow navigation", async () => {
    const user = userEvent.setup();
    render(<RecommendationPhotoCarousel photos={photos} userName="Радха" />);

    expect(screen.getByRole("img", { name: "Радха, фото 1 из 3" })).toHaveAttribute(
      "src",
      photos[0].url,
    );

    await user.click(screen.getByRole("button", { name: "Следующее фото" }));
    expect(screen.getByRole("img", { name: "Радха, фото 2 из 3" })).toHaveAttribute(
      "src",
      photos[1].url,
    );

    await user.click(screen.getByRole("button", { name: "Предыдущее фото" }));
    expect(screen.getByRole("img", { name: "Радха, фото 1 из 3" })).toBeInTheDocument();
  });

  it("держит место снимка, пока снимок не пришёл", () => {
    // Пустой блок читается как поломка, а подложка — как ожидание. Иначе на
    // медленной связи человек смотрит на дыру там, где должно быть фото.
    const { container } = render(
      <RecommendationPhotoCarousel photos={photos} userName="Радха" />,
    );

    expect(container.querySelector(".photo-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /фото 1 из 3/ })).toHaveClass(
      "opacity-0",
    );
  });

  it("убирает подложку, когда снимок пришёл", () => {
    const { container } = render(
      <RecommendationPhotoCarousel photos={photos} userName="Радха" />,
    );

    fireEvent.load(screen.getByRole("img", { name: /фото 1 из 3/ }));

    expect(container.querySelector(".photo-skeleton")).toBeNull();
    expect(screen.getByRole("img", { name: /фото 1 из 3/ })).toHaveClass(
      "opacity-100",
    );
  });

  it("следующий снимок снова ждёт под подложкой", async () => {
    // Признак загрузки привязан к адресу, а не к флагу: флаг остался бы
    // поднятым от прошлого снимка, и новый показался бы готовым до времени.
    const user = userEvent.setup();
    const { container } = render(
      <RecommendationPhotoCarousel photos={photos} userName="Радха" />,
    );
    fireEvent.load(screen.getByRole("img", { name: /фото 1 из 3/ }));

    await user.click(screen.getByRole("button", { name: "Следующее фото" }));

    expect(container.querySelector(".photo-skeleton")).toBeInTheDocument();
  });

  it("отдаёт браузеру размеры снимка и не грузит всю ленту разом", () => {
    // Размеры известны из галереи — по ним браузер знает пропорции до того,
    // как получит сам файл. lazy нужен ленте: каруселей столько, сколько анкет.
    render(<RecommendationPhotoCarousel photos={photos} userName="Радха" />);

    const image = screen.getByRole("img", { name: /фото 1 из 3/ });
    expect(image).toHaveAttribute("width", "1200");
    expect(image).toHaveAttribute("height", "800");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
  });

  it("selects an exact photo with Russian-labelled dot buttons", async () => {
    const user = userEvent.setup();
    render(<RecommendationPhotoCarousel photos={photos} userName="Радха" />);

    await user.click(screen.getByRole("button", { name: "Показать фото 3 из 3" }));

    expect(screen.getByRole("img", { name: "Радха, фото 3 из 3" })).toHaveAttribute(
      "src",
      photos[2].url,
    );
  });

  it("hides all controls for one photo", () => {
    render(<RecommendationPhotoCarousel photos={[photos[0]]} userName="Радха" />);

    expect(screen.getByRole("img", { name: "Радха, фото 1 из 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not start an autoplay timer", () => {
    const intervalSpy = vi.spyOn(window, "setInterval");

    render(<RecommendationPhotoCarousel photos={photos} userName="Радха" />);

    expect(intervalSpy).not.toHaveBeenCalled();
    intervalSpy.mockRestore();
  });

  it("resets to the first photo when recommendation identity changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <RecommendationPhotoCarousel photos={photos} userName="Радха" />,
    );
    await user.click(screen.getByRole("button", { name: "Следующее фото" }));

    const nextPhotos = [
      { id: "new-photo", url: "https://example.com/new.webp", width: 900, height: 1200 },
      photos[0],
    ];
    rerender(<RecommendationPhotoCarousel photos={nextPhotos} userName="Кришна" />);

    expect(
      screen.getByRole("img", { name: "Кришна, фото 1 из 2" }),
    ).toHaveAttribute("src", nextPhotos[0].url);
  });
});

describe("RecommendationPhotoCarousel: обложка", () => {
  beforeEach(() => {
    window.localStorage.setItem("union:photo-hint-seen", "1");
  });
  afterEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  // Ради этого счётчик и заводился: полоски сверху терялись под вырезом
  // телефона, и о втором снимке никто не узнавал.
  it("говорит, сколько снимков и какой сейчас", () => {
    render(
      <RecommendationPhotoCarousel
        photos={photos}
        userName="Радха"
        variant="cover"
      />,
    );
    expect(screen.getByLabelText("Выбор фото")).toHaveTextContent("1/3");
  });

  it("листает сам: длинная пауза, потом короткий шаг", () => {
    vi.useFakeTimers();
    render(
      <RecommendationPhotoCarousel
        photos={photos}
        userName="Радха"
        variant="cover"
      />,
    );
    expect(screen.getByLabelText("Выбор фото")).toHaveTextContent("1/3");

    // Пока человек читает анкету, снимок не подменяем.
    act(() => void vi.advanceTimersByTime(AUTOPLAY_IDLE_MS - 1000));
    expect(screen.getByLabelText("Выбор фото")).toHaveTextContent("1/3");

    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByLabelText("Выбор фото")).toHaveTextContent("2/3");

    // Дальше шаг короче: длинная пауза нужна была один раз.
    act(() => void vi.advanceTimersByTime(AUTOPLAY_STEP_MS));
    expect(screen.getByLabelText("Выбор фото")).toHaveTextContent("3/3");

    // И по кругу: последний ведёт к первому.
    act(() => void vi.advanceTimersByTime(AUTOPLAY_STEP_MS));
    expect(screen.getByLabelText("Выбор фото")).toHaveTextContent("1/3");
  });

  it("отдаёт выбранный снимок наружу и слушается внешнего индекса", () => {
    const onIndexChange = vi.fn();
    const { rerender } = render(
      <RecommendationPhotoCarousel
        photos={photos}
        userName="Радха"
        variant="cover"
        index={0}
        onIndexChange={onIndexChange}
      />,
    );
    expect(screen.getByLabelText("Выбор фото")).toHaveTextContent("1/3");

    rerender(
      <RecommendationPhotoCarousel
        photos={photos}
        userName="Радха"
        variant="cover"
        index={2}
        onIndexChange={onIndexChange}
      />,
    );
    expect(screen.getByLabelText("Выбор фото")).toHaveTextContent("3/3");
    expect(screen.getByRole("img", { name: "Радха, фото 3 из 3" })).toHaveAttribute(
      "src",
      photos[2].url,
    );
  });
});
