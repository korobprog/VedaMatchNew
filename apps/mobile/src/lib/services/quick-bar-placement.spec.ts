import fs from 'node:fs';
import path from 'node:path';
import { QUICK_BAR_HIDDEN, QUICK_BAR_TABS, screenTopInset } from './quick-bar-placement';

/**
 * Где панель быстрого доступа есть, а где её нет (VED-385).
 *
 * Правило структурное — панель смонтирована в раскладке вкладок и нигде
 * больше, — поэтому и сторож читает структуру: исходники маршрутов и место
 * монтирования. Так устроены и соседние сторожа (`theme/hit-target.spec.ts`,
 * `theme/keyboard-scan.spec.ts`).
 */

const SRC = path.join(__dirname, '..', '..');
const APP = path.join(SRC, 'app');
const TABS_DIR = path.join(APP, '(tabs)');
const read = (file: string) => fs.readFileSync(file, 'utf8');

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.spec.')) found.push(full);
  }
  return found;
}

const rootStack = read(path.join(SRC, 'components', 'root-shell-stack.tsx'));
const declaredInRoot = new Set([...rootStack.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]));

describe('панель быстрого доступа — где она', () => {
  it('смонтирована ровно в одном месте — в раскладке вкладок', () => {
    const mounts = sourceFiles(SRC)
      .filter((file) => /<QuickBar[\s/>]/.test(read(file)))
      .map((file) => path.relative(SRC, file));
    expect(mounts).toEqual([path.join('app', '(tabs)', '_layout.tsx')]);
  });

  it('раскладка вкладок отдаёт экранам знак «вы под панелью»', () => {
    const layout = read(path.join(TABS_DIR, '_layout.tsx'));
    expect(layout).toMatch(/<QuickBarSlot value>/);
  });

  it('в группе вкладок ровно пять экранов — новый экран там получит панель, это надо решить явно', () => {
    const screens = fs
      .readdirSync(TABS_DIR)
      .filter((name) => name.endsWith('.tsx') && !name.startsWith('_') && !name.includes('.spec.'))
      .map((name) => name.replace(/\.tsx$/, ''))
      .sort();
    expect(screens).toEqual([...QUICK_BAR_TABS].sort());
  });

  it('корневой стек держит вкладки одним экраном, панель — только внутри них', () => {
    expect(declaredInRoot.has('(tabs)')).toBe(true);
    expect(rootStack).not.toMatch(/<QuickBar[\s/>]/);
  });
});

describe('панель быстрого доступа — где её нет', () => {
  it.each(QUICK_BAR_HIDDEN.map((item) => [item.route, item.why]))(
    '%s — объявлен в корневом стеке, а не во вкладках (%s)',
    (route) => {
      expect(declaredInRoot.has(route)).toBe(true);
      expect(fs.existsSync(path.join(TABS_DIR, `${route}.tsx`))).toBe(false);
      expect(fs.existsSync(path.join(APP, `${route}.tsx`))).toBe(true);
    },
  );

  it('переписка, звонки и сканер в списке — ради них правило и заведено', () => {
    const routes = QUICK_BAR_HIDDEN.map((item) => item.route);
    expect(routes).toEqual(expect.arrayContaining(['chat/[id]', 'call/[id]', 'group-call/[id]', 'wellness/scan']));
  });

  it('у каждого исключения есть причина словами', () => {
    for (const item of QUICK_BAR_HIDDEN) expect(item.why.trim().length).toBeGreaterThan(10);
  });
});

describe('верхний отступ экранов вкладок', () => {
  it('панель видна — вырез занят ею, экран его не повторяет', () => {
    expect(screenTopInset(24, true)).toBe(0);
  });

  it('панели нет — экран отступает под вырез сам', () => {
    expect(screenTopInset(24, false)).toBe(24);
  });

  // Экран, взявший `insets.top` мимо хука, под видимой панелью получил бы
  // пустую полосу высотой с вырез между панелью и своим заголовком.
  it.each(QUICK_BAR_TABS.map((name) => [name]))('вкладка %s берёт отступ из useScreenTopInset', (name) => {
    const source = read(path.join(TABS_DIR, `${name}.tsx`));
    const usesHookDirectly = source.includes('useScreenTopInset()');
    const usesScreenFrame = /<Screen[\s>]/.test(source);
    expect(usesHookDirectly || usesScreenFrame).toBe(true);
    expect(source).not.toMatch(/insets\.top/);
  });

  it('каркас Screen, которым пользуются вкладки, тоже берёт отступ из хука', () => {
    const source = read(path.join(SRC, 'components', 'screen.tsx'));
    expect(source).toContain('useScreenTopInset()');
    expect(source).not.toMatch(/insets\.top\b(?!`)/);
  });
});
