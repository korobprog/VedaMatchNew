import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(appDir, "../../public");

function pngSize(file: string): { width: number; height: number } {
  const buffer = readFileSync(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("manifest", () => {
  it("scopes the app to the whole portal", () => {
    const result = manifest();

    expect(result.id).toBe("/");
    expect(result.scope).toBe("/");
    expect(result.start_url).toBe("/");
    expect(result.display).toBe("standalone");
  });

  it("ships separate any and maskable icons that exist at the declared size", () => {
    const icons = manifest().icons ?? [];

    expect(icons.filter((icon) => icon.purpose === "any")).toHaveLength(2);
    expect(icons.filter((icon) => icon.purpose === "maskable")).toHaveLength(2);

    for (const icon of icons) {
      const file = path.join(publicDir, icon.src!);
      const [declared] = icon.sizes!.split("x");
      expect(pngSize(file)).toEqual({
        width: Number(declared),
        height: Number(declared),
      });
    }
  });

  it("первыми в быстром меню стоят три сервиса — Android показывает только их", () => {
    const urls = (manifest().shortcuts ?? []).map((shortcut) => shortcut.url);

    expect(urls.slice(0, 3)).toEqual(["/motivation", "/music", "/library"]);
    // Прежние пункты не потерялись — на компьютере видно всё меню.
    expect(urls).toEqual(expect.arrayContaining(["/vedabase", "/union"]));
  });

  it("у каждого пункта меню есть значки заявленного размера — без них Android пункт не показывает", () => {
    for (const shortcut of manifest().shortcuts ?? []) {
      const icons = shortcut.icons ?? [];
      expect(icons.map((icon) => icon.sizes)).toEqual(["96x96", "192x192"]);
      for (const icon of icons) {
        const [declared] = icon.sizes!.split("x");
        expect(pngSize(path.join(publicDir, icon.src))).toEqual({
          width: Number(declared),
          height: Number(declared),
        });
      }
    }
  });

  it("каждый пункт меню ведёт на существующую страницу", () => {
    for (const { url } of manifest().shortcuts ?? []) {
      const segment = url.replace(/^\//, "");
      const pages = [
        path.join(appDir, segment, "page.tsx"),
        path.join(appDir, "(portal)", segment, "page.tsx"),
      ];
      expect(pages.some((page) => existsSync(page)), url).toBe(true);
    }
  });

  it("provides an apple touch icon, which iOS needs outside the manifest", () => {
    expect(pngSize(path.join(appDir, "apple-icon.png"))).toEqual({
      width: 180,
      height: 180,
    });
  });
});
