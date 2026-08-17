import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VedaMatchMark } from "./vedamatch-mark";

const ROOT = join(__dirname, "..", "..", "..");
const componentSource = readFileSync(join(__dirname, "vedamatch-mark.tsx"), "utf8");
const fileSource = readFileSync(
  join(ROOT, "public", "logo-mark-on-dark.svg"),
  "utf8",
);

/** Все контуры знака: `d="…"` в любом из двух представлений. */
const contours = (source: string) =>
  [...source.matchAll(/\sd="([^"]+)"/g)].map((match) => match[1]);

describe("VedaMatchMark", () => {
  it("подписан для чтения с экрана", () => {
    render(<VedaMatchMark />);
    expect(screen.getByRole("img", { name: "VedaMatch" }).tagName).toBe("svg");
  });

  it("не жёстко зашивает цвет буквы — он приходит из темы", () => {
    const { container } = render(<VedaMatchMark />);
    const strokes = [...container.querySelectorAll("path")].map((path) =>
      path.getAttribute("stroke"),
    );
    expect(strokes).toContain("var(--vm-logo-mark, currentColor)");
  });

  it("разводит идентификаторы градиентов между копиями", () => {
    // Ссылки url(#…) резолвятся по всему документу: два знака на странице
    // с одинаковыми id перебивали бы друг другу заливку.
    const { container } = render(
      <>
        <VedaMatchMark />
        <VedaMatchMark />
      </>,
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((node) =>
      node.getAttribute("id"),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * Файл в public/ существует только потому, что Leaflet принимает атрибуцию
   * строкой HTML и переменные темы внутрь <img> не попадают. Это копия, а
   * копия рано или поздно разъезжается с оригиналом — здесь она этого не
   * сделает молча. Та же страховка, что у public/pwa-install-prompt.js.
   */
  it("держит копию в public/ в одной геометрии с компонентом", () => {
    expect(contours(fileSource)).toEqual(contours(componentSource));
  });

  /**
   * Разбор проверяется отдельно, потому что ломается он молча: битый SVG
   * отдаётся с кодом 200, исключений не бросает и в консоль ничего не пишет
   * — на месте знака просто появляется значок битой картинки размером
   * 12 пикселей. Реальный случай: в XML-комментарии нельзя два минуса
   * подряд, а имя CSS-переменной с её дефисами туда просилось само.
   */
  it("остаётся разбираемым XML", () => {
    const parsed = new DOMParser().parseFromString(fileSource, "image/svg+xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.documentElement.tagName).toBe("svg");
  });

  it("в копии для тёмной плашки буква залита светлым, а не токеном", () => {
    // CSS-переменной там взяться неоткуда: внешний SVG в <img> — отдельный
    // документ, стилей страницы он не видит.
    // Именно `var(…)`, а не любое упоминание: в шапке файла токен назван
    // словами, и это ровно то объяснение, ради которого файл существует.
    expect(fileSource).not.toContain("var(--vm-logo-mark");
    expect(fileSource).toContain('stroke="#F6F1FF"');
  });
});
