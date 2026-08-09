import { readFileSync } from "node:fs";
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

  it("keeps a shortcut into the library and into Union", () => {
    const urls = (manifest().shortcuts ?? []).map((shortcut) => shortcut.url);

    expect(urls).toEqual(["/vedabase", "/union"]);
  });

  it("provides an apple touch icon, which iOS needs outside the manifest", () => {
    expect(pngSize(path.join(appDir, "apple-icon.png"))).toEqual({
      width: 180,
      height: 180,
    });
  });
});
