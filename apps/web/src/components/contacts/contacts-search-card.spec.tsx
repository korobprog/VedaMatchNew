import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ContactsCardDto } from "@vedamatch/shared";
import { ContactsSearchCard } from "./contacts-search-card";

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

describe("ContactsSearchCard", () => {
  it("makes the name a link to the person's card page", () => {
    render(<ContactsSearchCard card={card} />);

    expect(screen.getByRole("link", { name: "Радха дд" })).toHaveAttribute(
      "href",
      "/contacts/users/u1",
    );
  });

  it("escapes the id it puts into the href", () => {
    render(<ContactsSearchCard card={{ ...card, userId: "a b/c" }} />);

    expect(screen.getByRole("link", { name: "Радха дд" })).toHaveAttribute(
      "href",
      "/contacts/users/a%20b%2Fc",
    );
  });
});
