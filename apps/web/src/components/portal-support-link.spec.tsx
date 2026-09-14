import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortalSupportLink } from "./portal-support-link";

describe("PortalSupportLink", () => {
  it("ведёт в поддержку", () => {
    render(<PortalSupportLink />);

    expect(
      screen.getByRole("link", { name: /Написать в поддержку/ }),
    ).toHaveAttribute("href", "/support");
  });
});
