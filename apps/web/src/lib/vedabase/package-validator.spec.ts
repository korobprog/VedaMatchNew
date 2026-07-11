import { describe, expect, it } from "vitest";
import type { VedabasePackageFile } from "@vedamatch/shared";
import {
  PackageValidationError,
  sha256Hex,
  validatePackageFile,
} from "./package-validator";

describe("Vedabase package validation", () => {
  it("computes a lowercase SHA-256 digest", async () => {
    await expect(sha256Hex(new Blob(["hello"]))).resolves.toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("accepts a file whose size and digest match", async () => {
    const body = new Blob(["hello"], { type: "text/plain" });
    const file: VedabasePackageFile = {
      path: "chapters/hello.json",
      bytes: body.size,
      sha256:
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      contentType: "text/plain",
    };

    await expect(validatePackageFile(file, body)).resolves.toBeUndefined();
  });

  it("rejects a file with a bad digest", async () => {
    const body = new Blob(["hello"]);
    const file: VedabasePackageFile = {
      path: "chapters/hello.json",
      bytes: body.size,
      sha256: "0".repeat(64),
      contentType: "application/json",
    };

    await expect(validatePackageFile(file, body)).rejects.toThrow(
      PackageValidationError,
    );
  });

  it("rejects a file with a mismatched byte count", async () => {
    const body = new Blob(["hello"]);
    const file: VedabasePackageFile = {
      path: "chapters/hello.json",
      bytes: body.size + 1,
      sha256:
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      contentType: "application/json",
    };

    await expect(validatePackageFile(file, body)).rejects.toThrow(
      "byte length",
    );
  });
});
