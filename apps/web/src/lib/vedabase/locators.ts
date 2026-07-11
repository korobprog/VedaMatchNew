import type { VedabaseLocator } from "@vedamatch/shared";

export interface VedabaseTextRange {
  block: string;
  start: number;
  end: number;
  quote: string;
}

export interface VedabaseSelectionRange {
  locator: VedabaseLocator;
  range: VedabaseTextRange;
}

export function canonicalLocator(locator: VedabaseLocator): VedabaseLocator {
  const result: VedabaseLocator = {
    bookSlug: nonBlank(locator.bookSlug, "bookSlug"),
    chapterSlug: nonBlank(locator.chapterSlug, "chapterSlug"),
    unitId: nonBlank(locator.unitId, "unitId"),
  };
  if (locator.block !== undefined) result.block = nonBlank(locator.block, "block");
  if (locator.start !== undefined) result.start = offset(locator.start, "start");
  if (locator.end !== undefined) result.end = offset(locator.end, "end");
  if (
    result.start !== undefined &&
    result.end !== undefined &&
    result.start > result.end
  ) {
    throw new Error("Locator start must not exceed its end");
  }
  return result;
}

export function canonicalTextRange(range: VedabaseTextRange): VedabaseTextRange {
  const result = {
    block: nonBlank(range.block, "block"),
    start: offset(range.start, "start"),
    end: offset(range.end, "end"),
    quote: range.quote.normalize("NFC"),
  };
  if (result.start >= result.end) {
    throw new Error("Text range start must be less than its end");
  }
  return result;
}

export function serializeLocator(locator: VedabaseLocator): string {
  return JSON.stringify(canonicalLocator(locator));
}

export function serializeTextRange(range: VedabaseTextRange): string {
  return JSON.stringify(canonicalTextRange(range));
}

export function selectionToRange(
  selection: Selection | null,
  readerRoot: HTMLElement,
  bookSlug: string,
  chapterSlug: string,
): VedabaseSelectionRange | null {
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;

  const source = selection.getRangeAt(0);
  const startBlock = closestBlock(source.startContainer);
  const endBlock = closestBlock(source.endContainer);
  if (!startBlock || startBlock !== endBlock || !readerRoot.contains(startBlock)) {
    return null;
  }
  const unit = startBlock.closest<HTMLElement>("[data-unit-id]");
  const block = startBlock.dataset.vedabaseBlock;
  const unitId = unit?.dataset.unitId;
  if (!unit || !block || !unitId || !readerRoot.contains(unit)) return null;

  const start = textOffset(startBlock, source.startContainer, source.startOffset);
  const end = textOffset(startBlock, source.endContainer, source.endOffset);
  const quote = source.toString().normalize("NFC");
  if (start >= end || quote.length === 0) return null;

  return {
    locator: canonicalLocator({
      bookSlug,
      chapterSlug,
      unitId,
      block,
      start,
      end,
    }),
    range: canonicalTextRange({ block, start, end, quote }),
  };
}

function closestBlock(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest<HTMLElement>("[data-vedabase-block]") ?? null;
}

function textOffset(root: HTMLElement, node: Node, nodeOffset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, nodeOffset);
  return range.toString().length;
}

function nonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must not be blank`);
  return normalized;
}

function offset(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}
