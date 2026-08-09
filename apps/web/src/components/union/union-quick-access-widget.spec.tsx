import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { UnionQuickAccessData } from "@/lib/union-quick-access";
import { UnionQuickAccessWidget } from "./union-quick-access-widget";

const empty: UnionQuickAccessData = {
  unreadMessages: 0,
  incomingLikes: 0,
  previewAvatars: [],
  moreCount: 0,
  profileCompletionPercent: null,
};

describe("UnionQuickAccessWidget", () => {
  it("renders nothing when there is no data to show", () => {
    const { container } = render(<UnionQuickAccessWidget {...empty} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows only the messages chip when only messages are unread", () => {
    render(<UnionQuickAccessWidget {...empty} unreadMessages={3} />);

    expect(screen.getByText("💬 3")).toBeInTheDocument();
    expect(screen.queryByText(/❤️/)).not.toBeInTheDocument();
  });

  it("shows only the likes chip when only likes are pending", () => {
    render(<UnionQuickAccessWidget {...empty} incomingLikes={2} />);

    expect(screen.getByText("❤️ 2")).toBeInTheDocument();
    expect(screen.queryByText(/💬/)).not.toBeInTheDocument();
  });

  it("renders preview avatars with an overflow count", () => {
    render(
      <UnionQuickAccessWidget
        {...empty}
        previewAvatars={[
          { url: null, initial: "А" },
          { url: "https://x/b.jpg", initial: "Б" },
        ]}
        moreCount={9}
      />,
    );

    expect(screen.getByText("А")).toBeInTheDocument();
    expect(screen.getByText("+9")).toBeInTheDocument();
  });

  it("hides the overflow label when moreCount is 0", () => {
    render(
      <UnionQuickAccessWidget
        {...empty}
        previewAvatars={[{ url: null, initial: "А" }]}
        moreCount={0}
      />,
    );

    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("shows the progress bar with the right value when below 100%", () => {
    render(
      <UnionQuickAccessWidget {...empty} profileCompletionPercent={72} />,
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "72",
    );
  });

  it("hides the progress bar when profileCompletionPercent is null", () => {
    render(<UnionQuickAccessWidget {...empty} />);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
