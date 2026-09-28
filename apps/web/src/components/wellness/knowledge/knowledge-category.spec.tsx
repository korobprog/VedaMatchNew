import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WellnessArticleListResponse,
  WellnessKnowledgeCategoryDto,
  WellnessKnowledgeCategoryPage,
} from "@vedamatch/shared";
import { KnowledgeCategory } from "./knowledge-category";
import {
  getWellnessKnowledgeArticles,
  getWellnessKnowledgeCategory,
} from "@/lib/wellness-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/wellness-api", () => ({
  WellnessApiError: class extends Error {},
  getWellnessKnowledgeCategory: vi.fn(),
  getWellnessKnowledgeArticles: vi.fn(),
  deleteWellnessKnowledgeCategory: vi.fn(),
  createWellnessKnowledgeCategory: vi.fn(),
  updateWellnessKnowledgeCategory: vi.fn(),
  createWellnessArticle: vi.fn(),
  updateWellnessArticle: vi.fn(),
  uploadWellnessArticleCover: vi.fn(),
  deleteWellnessArticleCover: vi.fn(),
}));

function category(
  over: Partial<WellnessKnowledgeCategoryDto> = {},
): WellnessKnowledgeCategoryDto {
  return {
    id: "ayurveda",
    parentId: null,
    slug: "ayurveda",
    titleRu: "Аюрведа",
    titleEn: "Ayurveda",
    descriptionRu: null,
    position: 0,
    articleCount: 1,
    children: [],
    ...over,
  };
}

const page: WellnessKnowledgeCategoryPage = {
  category: category(),
  breadcrumbs: [{ slug: "ayurveda", titleRu: "Аюрведа" }],
  children: [
    category({
      id: "herbs",
      parentId: "ayurveda",
      slug: "herbs",
      titleRu: "Травы",
    }),
  ],
};

const list: WellnessArticleListResponse = {
  items: [
    {
      id: "a-1",
      categoryId: "ayurveda",
      title: "Три доши",
      excerpt: "Вата, питта и капха",
      coverUrl: "https://cdn.example/cover.webp",
      status: "published",
      publishedAt: "2026-09-28T10:00:00.000Z",
      createdAt: "2026-09-28T10:00:00.000Z",
      updatedAt: "2026-09-28T10:00:00.000Z",
    },
  ],
  total: 1,
  page: 1,
  pageSize: 12,
};

describe("KnowledgeCategory", () => {
  beforeEach(() => {
    vi.mocked(getWellnessKnowledgeCategory).mockResolvedValue(page);
    vi.mocked(getWellnessKnowledgeArticles).mockResolvedValue(list);
  });

  it("shows subcategories and article cards with a cover", async () => {
    render(<KnowledgeCategory slug="ayurveda" canEdit={false} />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Аюрведа" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Травы/ })).toHaveAttribute(
      "href",
      "/wellness/knowledge/herbs",
    );
    const card = screen.getByRole("link", { name: /Три доши/ });
    expect(card).toHaveAttribute("href", "/wellness/knowledge/article/a-1");
    expect(card.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.example/cover.webp",
    );
    expect(
      screen.queryByRole("button", { name: "Добавить статью" }),
    ).not.toBeInTheDocument();
  });

  it("gives admins the editing buttons, but no delete on a root", async () => {
    render(<KnowledgeCategory slug="ayurveda" canEdit />);
    expect(
      await screen.findByRole("button", { name: "Добавить подрубрику" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Добавить статью" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Удалить рубрику" }),
    ).not.toBeInTheDocument();
  });
});
