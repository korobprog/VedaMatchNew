import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ContactsCardDto } from "@vedamatch/shared";
import { PeopleSearchCard } from "./people-search-card";

const card: ContactsCardDto = {
  userId: "u1",
  name: "Радха дд",
  headline: "Повар на праздничных программах",
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

  it("escapes the id it puts into the href", () => {
    render(<PeopleSearchCard card={{ ...card, userId: "a b/c" }} />);

    expect(screen.getByRole("link", { name: "Радха дд" })).toHaveAttribute(
      "href",
      "/chat/people/users/a%20b%2Fc",
    );
  });
});
