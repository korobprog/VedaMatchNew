import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ContactsCardDto } from "@vedamatch/shared";
import { PeopleSearchCard } from "./people-search-card";

const card: ContactsCardDto = {
  userId: "u1",
  name: "Радха дд",
  headline: "Повар на праздничных программах",
  statusLine: null,
  about: null,
  offers: null,
  avatarUrl: null,
  city: "Москва",
  country: "Россия",
  age: null,
  languages: ["русский"],
  ashram: "grihastha",
  format: "offline",
  spiritualStage: "devotee",
  isVerifiedDevotee: false,
  isPhotoVerified: false,
  tags: [],
  contacts: null,
};

describe("PeopleSearchCard", () => {
  it("makes the name a link to the person's card page", () => {
    render(<PeopleSearchCard card={card} />);

    expect(screen.getByRole("link", { name: "Радха дд" })).toHaveAttribute(
      "href",
      "/chat/people/users/u1",
    );
  });

  it("shows the exact last visit (VED-318)", () => {
    const now = new Date(2026, 8, 27, 14, 30);
    const seen = new Date(2026, 8, 3, 9, 7).toISOString();
    render(<PeopleSearchCard card={{ ...card, lastSeenAt: seen }} now={now} />);

    const time = screen.getByText("был(а) 3 сентября в 09:07");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("dateTime", seen);
  });

  it("shows «в сети» for a visit within five minutes", () => {
    const now = new Date(2026, 8, 27, 14, 30);
    render(
      <PeopleSearchCard
        card={{
          ...card,
          lastSeenAt: new Date(now.getTime() - 60_000).toISOString(),
        }}
        now={now}
      />,
    );

    expect(screen.getByText("в сети")).toBeInTheDocument();
  });

  it("marks a newcomer and names the day in words (VED-319)", () => {
    const now = new Date(2026, 8, 27, 14, 30);
    const joinedAt = new Date(now.getTime() - 30 * 3_600_000).toISOString();
    render(<PeopleSearchCard card={{ ...card, joinedAt }} now={now} />);

    const label = screen.getByText("Новый участник: 2-й день на портале");
    expect(label.parentElement).toHaveClass("text-newcomer-2");
    expect(label.parentElement).toHaveAttribute(
      "title",
      "Новый участник: 2-й день на портале",
    );
  });

  it("drops the newcomer mark after three days", () => {
    const now = new Date(2026, 8, 27, 14, 30);
    const joinedAt = new Date(now.getTime() - 72 * 3_600_000).toISOString();
    render(<PeopleSearchCard card={{ ...card, joinedAt }} now={now} />);

    expect(screen.queryByText("Новый")).not.toBeInTheDocument();
  });

  it("escapes the id it puts into the href", () => {
    render(<PeopleSearchCard card={{ ...card, userId: "a b/c" }} />);

    expect(screen.getByRole("link", { name: "Радха дд" })).toHaveAttribute(
      "href",
      "/chat/people/users/a%20b%2Fc",
    );
  });
});
