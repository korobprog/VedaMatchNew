import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MusicEditorIdentity } from "./editor-identity";
import { useMusicPlayer } from "./player-provider";

vi.mock("./player-provider", () => ({ useMusicPlayer: vi.fn() }));

const setIsMusicEditor = vi.fn();

beforeEach(() => {
  setIsMusicEditor.mockReset();
  vi.mocked(useMusicPlayer).mockReturnValue({
    setIsMusicEditor,
  } as never);
});

describe("MusicEditorIdentity", () => {
  it("ничего не рисует", () => {
    const { container } = render(<MusicEditorIdentity canEdit={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("сообщает плееру право редакции", () => {
    render(<MusicEditorIdentity canEdit={true} />);
    expect(setIsMusicEditor).toHaveBeenCalledWith(true);
  });

  it("снимает право при размонтировании", () => {
    const { unmount } = render(<MusicEditorIdentity canEdit={true} />);
    setIsMusicEditor.mockClear();
    unmount();
    expect(setIsMusicEditor).toHaveBeenCalledWith(false);
  });

  it("не падает, если плеера нет (страница без провайдера)", () => {
    vi.mocked(useMusicPlayer).mockReturnValue(null);
    expect(() => render(<MusicEditorIdentity canEdit={true} />)).not.toThrow();
  });
});
