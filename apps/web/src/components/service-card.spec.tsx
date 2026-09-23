import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ServiceCard as ServiceCardType } from "@vedamatch/shared";
import { ServiceCard } from "./service-card";

const service: ServiceCardType = {
  id: "union",
  slug: "union",
  name: "Union",
  nameEn: "Union",
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

  it("renders extra content between the description and the button", () => {
    render(
      <ServiceCard
        service={service}
        extra={<div data-testid="quick-access">widget</div>}
      />,
    );

    expect(screen.getByTestId("quick-access")).toBeInTheDocument();
  });

  // VED-401: булавка ушла в режим «Порядок», на её месте — кнопки сервиса.
  it("has no pin button and renders header buttons next to the title", () => {
    render(
      <ServiceCard
        service={service}
        isPinned
        headerExtra={<a href="/union/new">Новые</a>}
      />,
    );

    expect(screen.queryByRole("button", { name: /Закрепить|Открепить/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Новые" })).toBeInTheDocument();
  });

  it("renders no extra content when the prop is omitted", () => {
    render(<ServiceCard service={service} />);

    expect(screen.queryByTestId("quick-access")).not.toBeInTheDocument();
  });
});
