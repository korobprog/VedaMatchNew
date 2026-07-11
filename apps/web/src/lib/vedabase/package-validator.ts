import type {
  VedabaseBookManifest,
  VedabaseChapterDocument,
  VedabasePackageFile,
} from "@vedamatch/shared";

const sha256Pattern = /^[a-f0-9]{64}$/;
const safeSegmentPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export class PackageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackageValidationError";
  }
}

export async function sha256Hex(body: Blob): Promise<string> {
  const buffer = await readBlobAsArrayBuffer(body);
  const digest = await crypto.subtle.digest("SHA-256", buffer);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function readBlobAsText(body: Blob): Promise<string> {
  if (typeof body.text === "function") {
    return body.text();
  }

  return readBlobWithFileReader<string>(body, "text");
}

export async function validatePackageFile(
  file: VedabasePackageFile,
  body: Blob,
): Promise<void> {
  assertPackageFile(file);
  if (body.size !== file.bytes) {
    throw new PackageValidationError(
      `Package file ${file.path} has byte length ${body.size}; expected ${file.bytes}`,
    );
  }

  const digest = await sha256Hex(body);
  if (digest !== file.sha256.toLowerCase()) {
    throw new PackageValidationError(
      `Package file ${file.path} failed SHA-256 validation`,
    );
  }
}

export function validateBookManifest(
  value: unknown,
): VedabaseBookManifest {
  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    !isSafeSegment(value.slug) ||
    !isNonEmptyString(value.title) ||
    !(value.author === null || typeof value.author === "string") ||
    value.language !== "ru" ||
    !isSafeSegment(value.contentVersion) ||
    !isSha256(value.packageChecksum) ||
    !isNonNegativeInteger(value.sizeBytes) ||
    !(value.coverPath === null || isSafeRelativePath(value.coverPath)) ||
    !isNonEmptyString(value.sourceUrl) ||
    value.sourceOrigin !== "https://vedabase.ru" ||
    !isNonEmptyString(value.importedAt) ||
    !isNonEmptyString(value.permissionRef) ||
    !isNonEmptyString(value.attribution) ||
    !Array.isArray(value.chapters) ||
    !Array.isArray(value.files)
  ) {
    throw new PackageValidationError("Book manifest metadata is invalid");
  }

  const chaptersValid = value.chapters.every(
    (chapter) =>
      isRecord(chapter) &&
      isSafeSegment(chapter.slug) &&
      isNonEmptyString(chapter.title) &&
      Number.isSafeInteger(chapter.order) &&
      isSafeRelativePath(chapter.file),
  );
  if (!chaptersValid) {
    throw new PackageValidationError("Book manifest chapters are invalid");
  }

  value.files.forEach(assertPackageFile);
  const filePaths = value.files.map((file) => file.path);
  if (new Set(filePaths).size !== filePaths.length) {
    throw new PackageValidationError("Book manifest contains duplicate files");
  }
  if (
    value.chapters.some(
      (chapter) => !filePaths.includes(chapter.file),
    )
  ) {
    throw new PackageValidationError(
      "Book manifest references an undeclared chapter file",
    );
  }

  return value as unknown as VedabaseBookManifest;
}

export function validateChapterDocument(
  value: unknown,
): VedabaseChapterDocument {
  if (
    !isRecord(value) ||
    !isSafeSegment(value.bookSlug) ||
    !isSafeSegment(value.slug) ||
    !isNonEmptyString(value.title) ||
    !Number.isSafeInteger(value.order) ||
    !Array.isArray(value.units) ||
    !value.units.every(isReadingUnit)
  ) {
    throw new PackageValidationError("Chapter document is invalid");
  }

  return value as unknown as VedabaseChapterDocument;
}

function assertPackageFile(value: unknown): asserts value is VedabasePackageFile {
  if (
    !isRecord(value) ||
    !isSafeRelativePath(value.path) ||
    !isNonNegativeInteger(value.bytes) ||
    !isSha256(value.sha256) ||
    !isNonEmptyString(value.contentType)
  ) {
    throw new PackageValidationError("Package file metadata is invalid");
  }
}

function isReadingUnit(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.title) ||
    !isNonEmptyString(value.sourceUrl)
  ) {
    return false;
  }

  return [
    "originalHtml",
    "transliterationHtml",
    "synonymsHtml",
    "translationHtml",
    "purportHtml",
    "bodyHtml",
  ].every((field) => value[field] === undefined || typeof value[field] === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && sha256Pattern.test(value);
}

function isSafeSegment(value: unknown): value is string {
  return typeof value === "string" && safeSegmentPattern.test(value);
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\")) {
    return false;
  }

  const segments = value.split("/");
  return segments.every(
    (segment) => segment !== "" && segment !== "." && segment !== "..",
  );
}

export async function readBlobAsArrayBuffer(body: Blob): Promise<ArrayBuffer> {
  if (typeof body.arrayBuffer === "function") {
    return body.arrayBuffer();
  }

  return readBlobWithFileReader<ArrayBuffer>(body, "arrayBuffer");
}

function readBlobWithFileReader<Result extends ArrayBuffer | string>(
  body: Blob,
  format: "arrayBuffer" | "text",
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read Blob"));
    reader.onload = () => resolve(reader.result as Result);
    if (format === "arrayBuffer") {
      reader.readAsArrayBuffer(body);
    } else {
      reader.readAsText(body);
    }
  });
}
