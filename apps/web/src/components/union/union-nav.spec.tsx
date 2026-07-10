import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UnionNav } from "./union-nav";

describe("UnionNav", () => {
  it("hides the incoming request badge when the count is zero", () => {
    render(<UnionNav incomingPending={0} />);

    expect(screen.getByRole("link", { name: "Связи" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Входящих заявок/)).not.toBeInTheDocument();
  });

  it("shows the incoming request badge beside connections", () => {
    render(<UnionNav incomingPending={4} />);

    expect(screen.getByLabelText("Входящих заявок: 4")).toHaveTextContent("4");
  });
});
