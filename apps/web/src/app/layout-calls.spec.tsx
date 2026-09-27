import { isValidElement, type ReactElement, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * VED-231: входящий звонок обязан доходить до человека на любой странице,
 * а не только внутри группы (portal). Проверяем деревья layout'ов:
 * провайдер звонков стоит в корневом — над /profile, /library и прочими, —
 * и ровно один на странице группы (portal), без дубля в её layout.
 */

const cookieJar = vi.hoisted(() => ({ session: true }));
const profile = vi.hoisted(() => ({
  value: { id: "u1", role: "user", adminServices: [] } as {
    id: string;
    role: string;
    adminServices: string[];
  } | null,
}));

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "font-var", className: "font" }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "access_token" && cookieJar.session
        ? { name, value: "token" }
        : undefined,
  }),
  headers: async () => new Headers(),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "ru" }));
vi.mock("@/lib/api", () => ({
  getPublicServices: async () => [],
  getProfile: async () => profile.value,
}));
vi.mock("@/lib/require-user", () => ({
  requireUser: async () => profile.value,
}));
vi.mock("@/components/chat/calls/call-provider", () => ({
  ChatCallProvider: ({
    userId,
    children,
  }: {
    userId: string;
    children: ReactNode;
  }) => (
    <div data-testid="chat-call-provider" data-user={userId}>
      {children}
    </div>
  ),
}));
vi.mock("@/components/chat/calls/group/group-call-provider", () => ({
  GroupCallProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="group-call-provider">{children}</div>
  ),
}));

const { default: RootLayout } = await import("./layout");
const { default: PortalLayout } = await import("./(portal)/layout");
const { PortalCallProviders } =
  await import("@/components/chat/calls/portal-call-providers");
const { ChatCallProvider } =
  await import("@/components/chat/calls/call-provider");
const { GroupCallProvider } =
  await import("@/components/chat/calls/group/group-call-provider");

const CALL_TYPES = new Set<unknown>([
  PortalCallProviders,
  ChatCallProvider,
  GroupCallProvider,
]);

/** Все элементы дерева JSX (не рендеря клиентские компоненты). */
function collect(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  out.push(node);
  collect((node.props as { children?: ReactNode }).children, out);
  return out;
}

function callProviders(tree: ReactNode) {
  return collect(tree).filter((el) => CALL_TYPES.has(el.type));
}

describe("звонки на всех страницах (VED-231)", () => {
  beforeEach(() => {
    cookieJar.session = true;
    profile.value = { id: "u1", role: "user", adminServices: [] };
  });

  it("корневой layout ставит провайдер звонков над страницей вне (portal)", async () => {
    const page = <main data-testid="profile-page">Профиль</main>;
    const tree = await RootLayout({ children: page });
    const found = callProviders(tree);
    expect(found).toHaveLength(1);
    const provider = found[0] as ReactElement<{
      userId: string;
      children: ReactNode;
    }>;
    expect(provider.type).toBe(PortalCallProviders);
    expect(provider.props.userId).toBe("u1");
    expect(collect(provider.props.children)).toContain(page);
  });

  it("гостю провайдер звонков не поднимается", async () => {
    cookieJar.session = false;
    profile.value = null;
    const tree = await RootLayout({ children: <main /> });
    expect(callProviders(tree)).toHaveLength(0);
  });

  it("layout группы (portal) второго провайдера не ставит", async () => {
    const tree = await PortalLayout({ children: <main /> });
    expect(callProviders(tree)).toHaveLength(0);
  });

  it("общий провайдер поднимает ровно по одному ChatCallProvider и GroupCallProvider", () => {
    render(
      <PortalCallProviders userId="u1">
        <p>страница</p>
      </PortalCallProviders>,
    );
    expect(screen.getAllByTestId("chat-call-provider")).toHaveLength(1);
    expect(screen.getAllByTestId("group-call-provider")).toHaveLength(1);
    expect(screen.getByTestId("chat-call-provider").dataset.user).toBe("u1");
    expect(screen.getByText("страница")).toBeInTheDocument();
  });

  it("без userId общий провайдер отдаёт страницу как есть", () => {
    render(
      <PortalCallProviders userId={null}>
        <p>страница</p>
      </PortalCallProviders>,
    );
    expect(screen.queryByTestId("chat-call-provider")).toBeNull();
    expect(screen.getByText("страница")).toBeInTheDocument();
  });
});
