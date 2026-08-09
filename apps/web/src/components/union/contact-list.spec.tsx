import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UnionVisibleContacts } from "@vedamatch/shared";
import { ContactList } from "./contact-list";

function contacts(overrides: Partial<UnionVisibleContacts> = {}): UnionVisibleContacts {
  return {
    messengers: {},
    socialLinks: {},
    ...overrides,
  };
}

describe("ContactList", () => {
  it("renders nothing when there are no filled contacts", () => {
    const { container } = render(<ContactList contacts={contacts()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("is collapsible via a details/summary element, open by default", () => {
    render(
      <ContactList
        contacts={contacts({ messengers: { telegram: "@radha" } })}
      />,
    );

    const details = screen.getByText("Контакты открыты").closest("details");
    expect(details).toHaveAttribute("open");
  });

  it("builds a t.me link from a bare @username", () => {
    render(
      <ContactList
        contacts={contacts({ messengers: { telegram: "@YlChernikovich" } })}
      />,
    );

    expect(screen.getByRole("link", { name: "@YlChernikovich" })).toHaveAttribute(
      "href",
      "https://t.me/YlChernikovich",
    );
  });

  it("uses an already-full URL as-is instead of rewriting it", () => {
    render(
      <ContactList
        contacts={contacts({
          socialLinks: { vk: "https://vk.ru/id538042126" },
        })}
      />,
    );

    expect(
      screen.getByRole("link", { name: "https://vk.ru/id538042126" }),
    ).toHaveAttribute("href", "https://vk.ru/id538042126");
  });

  it("renders MAX as plain text with no link, since it has no known deep-link scheme", () => {
    render(<ContactList contacts={contacts({ messengers: { mx: "radha_mx" } })} />);

    expect(screen.queryByRole("link", { name: "radha_mx" })).not.toBeInTheDocument();
    expect(screen.getByText("radha_mx")).toBeInTheDocument();
  });

  it("copies the contact value to the clipboard when the copy button is clicked", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <ContactList
        contacts={contacts({ messengers: { telegram: "@radha" } })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Скопировать Telegram" }));

    expect(writeText).toHaveBeenCalledWith("@radha");
  });
});

describe("ContactList label deduplication", () => {
  it("labels both messenger and social telegram entries independently", () => {
    render(
      <ContactList
        contacts={contacts({
          messengers: { telegram: "@radha_dm" },
          socialLinks: { telegram: "@radha_channel" },
        })}
      />,
    );

    expect(screen.getAllByText("Telegram:")).toHaveLength(2);
  });
});
