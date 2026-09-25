import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

/**
 * Поиск по отрисованному дереву для тестов экранов Знакомств. Только для
 * `*.spec.tsx`: приложение этот модуль не импортирует. Своя копия, а не
 * помощник блога: общее между сервисами дублируется (контракт сервисов).
 */

export function screenText(renderer: ReactTestRenderer): string {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      found.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
  };
  walk(renderer.toJSON());
  return found.join(' ');
}

function textOf(node: ReactTestInstance): string {
  const parts: string[] = [];
  const walk = (child: ReactTestInstance | string): void => {
    if (typeof child === 'string') {
      parts.push(child);
      return;
    }
    for (const next of child.children) walk(next as ReactTestInstance | string);
  };
  walk(node);
  return parts.join(' ');
}

function isAncestor(ancestor: ReactTestInstance, node: ReactTestInstance): boolean {
  let current = node.parent;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

/** Самые внутренние нажимаемые узлы по подписи для скринридера или по тексту внутри. */
export function pressables(renderer: ReactTestRenderer, match: string | RegExp): ReactTestInstance[] {
  const test = (value: string) => (typeof match === 'string' ? value.includes(match) : match.test(value));
  const all = renderer.root.findAll((node) => {
    if (typeof node.props?.onPress !== 'function') return false;
    const label = node.props?.accessibilityLabel;
    return (typeof label === 'string' && test(label)) || test(textOf(node));
  });
  return all.filter((node) => !all.some((other) => other !== node && isAncestor(node, other)));
}

export function pressable(renderer: ReactTestRenderer, match: string | RegExp): ReactTestInstance {
  const found = pressables(renderer, match);
  if (found.length === 0) throw new Error(`Нет кнопки «${String(match)}»`);
  return found[0];
}
