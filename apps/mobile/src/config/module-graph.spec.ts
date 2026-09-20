import { parseImportSpecifiers, walkModuleGraph, type ModuleGraphDeps } from './module-graph';

describe('parseImportSpecifiers', () => {
  it('берёт импорты, реэкспорты, динамический import и require', () => {
    const source = [
      "import { a } from '@/lib/a';",
      "import type { B } from './b';",
      "import './side-effect';",
      "export { c } from '../c';",
      "const d = require('./d');",
      "const e = await import('./e');",
    ].join('\n');
    expect(parseImportSpecifiers(source).sort()).toEqual([
      '../c',
      './b',
      './d',
      './e',
      './side-effect',
      '@/lib/a',
    ]);
  });

  it('не дублирует один и тот же модуль', () => {
    expect(parseImportSpecifiers("import a from './x';\nimport b from './x';")).toEqual(['./x']);
  });

  it('не тащит за собой состояние регулярки между вызовами', () => {
    const source = "import a from './x';";
    expect(parseImportSpecifiers(source)).toEqual(parseImportSpecifiers(source));
  });

  it('обычные строки импортами не считаются', () => {
    expect(parseImportSpecifiers("const url = 'https://vedamatch.ru';")).toEqual([]);
  });
});

/** Дерево в памяти: файл → исходник. Резолв упрощён до «путь как написан». */
function deps(tree: Record<string, string>, shims: Record<string, string> = {}): ModuleGraphDeps {
  return {
    readSource: (file) => tree[file] ?? null,
    resolve: (_from, specifier) => shims[specifier] ?? (specifier in tree ? specifier : null),
  };
}

describe('walkModuleGraph', () => {
  it('собирает всё достижимое из точек входа', () => {
    const tree = {
      'app.tsx': "import './screen';",
      './screen': "import './deep';",
      './deep': '',
      './unreachable': "import './deep';",
    };
    expect(walkModuleGraph(['app.tsx'], deps(tree))).toEqual(['./deep', './screen', 'app.tsx']);
  });

  it('не зацикливается на взаимных импортах', () => {
    const tree = { a: "import './b';", b: "import './a';" };
    expect(walkModuleGraph(['a'], { readSource: (f) => tree[f as 'a'] ?? null, resolve: (_f, s) => s.replace('./', '') })).toEqual(['a', 'b']);
  });

  it('внешние пакеты и отсутствующие файлы просто не входят в граф', () => {
    const tree = { 'app.tsx': "import 'react-native';\nimport './нет-такого';" };
    expect(walkModuleGraph(['app.tsx'], deps(tree))).toEqual(['app.tsx']);
  });

  it('подмена модуля уводит граф на заглушку, а настоящий модуль остаётся вне графа', () => {
    const tree = {
      'app.tsx': "import { S } from '@/section';",
      '@/section': "import './тяжёлое';",
      './тяжёлое': '',
      'shim.tsx': '',
    };
    expect(walkModuleGraph(['app.tsx'], deps(tree, { '@/section': 'shim.tsx' }))).toEqual(['app.tsx', 'shim.tsx']);
  });

  it('несколько точек входа объединяются', () => {
    const tree = { one: "import './shared';", two: "import './shared';", './shared': '' };
    expect(walkModuleGraph(['one', 'two'], deps(tree))).toEqual(['./shared', 'one', 'two']);
  });
});
