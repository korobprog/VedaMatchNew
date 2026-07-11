export interface TocLink {
  title: string;
  sourceUrl: string;
  parentSourceUrl?: string | null;
}

export interface TocNode {
  title: string;
  sourceUrl: string;
  children: TocNode[];
}

export function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function naturalParts(value: string): string[] {
  return value.match(/\d+|\D+/g) ?? [];
}

export function compareNatural(left: string, right: string): number {
  const leftParts = naturalParts(left);
  const rightParts = naturalParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }
    if (leftPart === rightPart) {
      continue;
    }

    const leftIsNumber = /^\d+$/.test(leftPart);
    const rightIsNumber = /^\d+$/.test(rightPart);
    if (leftIsNumber && rightIsNumber) {
      const numericDifference = Number(leftPart) - Number(rightPart);
      if (numericDifference !== 0) {
        return numericDifference;
      }
      return leftPart.length - rightPart.length;
    }
    return compareOrdinal(leftPart, rightPart);
  }

  return 0;
}

function compareNodes(left: TocNode, right: TocNode): number {
  const urlDifference = compareNatural(left.sourceUrl, right.sourceUrl);
  return urlDifference || compareOrdinal(left.title, right.title);
}

export function buildToc(links: readonly TocLink[]): TocNode[] {
  const nodes = new Map<string, TocNode>();
  for (const link of links) {
    if (nodes.has(link.sourceUrl)) {
      throw new Error(`Duplicate TOC source URL: ${link.sourceUrl}`);
    }
    nodes.set(link.sourceUrl, {
      title: link.title,
      sourceUrl: link.sourceUrl,
      children: [],
    });
  }

  const roots: TocNode[] = [];
  for (const link of links) {
    const node = nodes.get(link.sourceUrl)!;
    if (!link.parentSourceUrl) {
      roots.push(node);
      continue;
    }
    const parent = nodes.get(link.parentSourceUrl);
    if (!parent) {
      throw new Error(
        `Orphan TOC node ${link.sourceUrl}: missing ${link.parentSourceUrl}`,
      );
    }
    parent.children.push(node);
  }

  const visited = new Set<string>();
  const sortTree = (node: TocNode): void => {
    if (visited.has(node.sourceUrl)) {
      throw new Error(`Duplicate or cyclic TOC node: ${node.sourceUrl}`);
    }
    visited.add(node.sourceUrl);
    node.children.sort(compareNodes);
    node.children.forEach(sortTree);
  };
  roots.sort(compareNodes);
  roots.forEach(sortTree);

  if (visited.size !== links.length) {
    throw new Error("Orphan or cyclic TOC nodes are not reachable from a root");
  }
  return roots;
}

export function sortBySourceUrl<T extends { sourceUrl: string }>(
  values: readonly T[],
): T[] {
  return [...values].sort((left, right) =>
    compareNatural(left.sourceUrl, right.sourceUrl),
  );
}
