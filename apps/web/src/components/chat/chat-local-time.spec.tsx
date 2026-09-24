import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import { ChatLocalTime } from "./chat-local-time";

const format = (iso: string) => `в ${iso.slice(11, 16)}`;

describe("ChatLocalTime", () => {
  it("сервер отдаёт пустой <time>: часовой пояс сервера не попадает в разметку", () => {
    const html = renderToString(
      <ChatLocalTime iso="2030-01-01T14:05:00Z" format={format} />,
    );
    expect(html).toBe('<time dateTime="2030-01-01T14:05:00Z"></time>');
  });

  it("в браузере — время по формату", () => {
    render(<ChatLocalTime iso="2030-01-01T14:05:00Z" format={format} />);
    expect(screen.getByText("в 14:05")).toBeTruthy();
  });

  it("без времени — ничего", () => {
    const { container } = render(<ChatLocalTime iso={null} format={format} />);
    expect(container.innerHTML).toBe("");
  });
});
