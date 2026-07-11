import { GITABASE_BOOK_SLUGS } from "./catalog.js";

const SOURCE_HOSTNAME = "vedabase.ru";
const BOOK_SLUGS = new Set<string>(GITABASE_BOOK_SLUGS);
const CLEAN_BOOK_PATH =
  /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*\/$/;

function rejectSourceUrl(url: URL): never {
  throw new Error(`Source URL is not allowed: ${url.href}`);
}

export function assertAllowedSourceUrl(url: URL): void {
  const hasQueryOrHashDelimiter = /[?#]/.test(url.href);

  if (
    url.protocol !== "https:" ||
    url.hostname !== SOURCE_HOSTNAME ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    hasQueryOrHashDelimiter
  ) {
    rejectSourceUrl(url);
  }

  if (url.pathname === "/sitemap.xml") {
    return;
  }

  if (url.pathname.toLowerCase().includes(".php")) {
    rejectSourceUrl(url);
  }

  const pathMatch = CLEAN_BOOK_PATH.exec(url.pathname);
  if (!pathMatch || !BOOK_SLUGS.has(pathMatch[1])) {
    rejectSourceUrl(url);
  }
}
