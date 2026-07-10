import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ServiceCard as ServiceCardType } from "@vedamatch/shared";
import { ServiceCard } from "./service-card";

const service: ServiceCardType = {
  id: "union",
  slug: "union",
  name: "Union",
  description: "Знакомства и сотрудничество",
  iconUrl: null,
  url: "/union",
  status: "active",
  category: "community",
  requiresDevoteeVerification: false,
};

describe("ServiceCard", () => {
  it("hides a zero badge", () => {
    render(<ServiceCard service={service} badgeCount={0} />);

    expect(screen.queryByLabelText(/Входящих заявок/)).not.toBeInTheDocument();
  });

  it("shows a positive badge", () => {
    render(<ServiceCard service={service} badgeCount={2} />);

    expect(screen.getByLabelText("Входящих заявок: 2")).toHaveTextContent("2");
  });
});
