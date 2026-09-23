import fs from 'node:fs';
import path from 'node:path';
import {
  KEYBOARD_SAFE_WRAPPERS,
  keyboardViolations,
  scanKeyboardSafety,
} from './keyboard-scan';

/**
 * Сторож уровня приложения: экран с полем ввода обязан поднимать его над
 * клавиатурой принятым в проекте способом.
 *
 * Правило до этого держалось на глаз, и пользователь поймал его нарушение
 * дважды на живом телефоне — сначала в ручном вводе штрихкода, потом в
 * названии продукта. Устроено как `hit-target.spec.ts`: сначала нарушения,
 * потом охват самого разбора.
 */

const SRC = path.join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.spec.'))
      found.push(full);
  }
  return found;
}

const files = sourceFiles(SRC).map((file) => ({
  file: path.relative(SRC, file),
  source: fs.readFileSync(file, 'utf8'),
}));
const withInput = files.filter(({ source }) => scanKeyboardSafety(source).hasInput);

/**
 * Исключения — только с причиной, как замеренные пары в `contrast.spec.ts`.
 * Новый файл в этом списке обязан объясняться словами, иначе список
 * превращается в свалку, а сторож — в украшение.
 */
const KNOWN: { file: string; why: string }[] = [
  {
    file: 'components/wellness/manual-barcode-form.tsx',
    // Не экран, а форма: подъём даёт её единственный потребитель — сканер.
    // Проверяется отдельным тестом ниже, а не на слово.
    why: 'форма, обёртку даёт потребитель (app/wellness/scan.tsx)',
  },
  // Долг, не мной заведённый и не мной чинимый: эти три экрана существовали
  // до VED-335 и в карточку не входят. Названы поимённо, чтобы их починка
  // была видимой задачей, а не «когда-нибудь само».
  { file: 'app/login.tsx', why: 'долг до VED-335: экран входа' },
  {
    file: 'components/notifications/inbox-search-box.tsx',
    why: 'долг до VED-335: поиск по ленте уведомлений',
  },
  {
    file: 'components/people/people-directory-section.tsx',
    why: 'долг до VED-335: поиск по справочнику людей',
  },
];

describe('поле ввода и клавиатура', () => {
  it('ни одного НОВОГО экрана с полем без подъёма над клавиатурой', () => {
    const known = new Set(KNOWN.map((item) => item.file));
    const unexpected = keyboardViolations(files).filter(
      (message) => !known.has(message.split(' — ')[0]),
    );
    expect(unexpected).toEqual([]);
  });

  it('список исключений не протух: каждое ещё нарушает правило', () => {
    // Иначе починенный экран навсегда остаётся «исключением», и следующая
    // поломка в нём проходит молча.
    const violating = new Set(
      keyboardViolations(files).map((message) => message.split(' — ')[0]),
    );
    for (const item of KNOWN) {
      expect(violating.has(item.file)).toBe(true);
    }
  });

  it('у формы ручного ввода обёртку действительно даёт сканер', () => {
    // Единственное исключение, которое оправдано устройством, а не долгом, —
    // проверяем его фактом, а не обещанием в комментарии.
    const scan = files.find(({ file }) => file.replace(/\\/g, '/') === 'app/wellness/scan.tsx');
    expect(scan).toBeDefined();
    expect(scan?.source).toContain('ManualBarcodeForm');
    expect(scanKeyboardSafety(scan?.source ?? '').hasWrapper).toBe(true);
  });

  /**
   * Охват. Числа — нижние границы «столько уже разобрано», а не цель: они
   * падают, если разбор перестал узнавать разметку, и не мешают добавлять
   * новые экраны.
   */
  it('разбор узнаёт поля и обёртки, а не молчит', () => {
    expect(files.length).toBeGreaterThanOrEqual(85);
    expect(withInput.length).toBeGreaterThanOrEqual(5);
  });

  it('экраны «Здоровья» с полями разобраны поимённо', () => {
    const names = withInput.map((item) => item.file.replace(/\\/g, '/'));
    expect(names).toEqual(
      expect.arrayContaining([
        'components/wellness/manual-barcode-form.tsx',
        'app/wellness/label/[barcode].tsx',
      ]),
    );
  });
});

describe('scanKeyboardSafety', () => {
  it('видит поле ввода', () => {
    expect(scanKeyboardSafety('<TextInput value={x} />').hasInput).toBe(true);
    expect(scanKeyboardSafety('<TextInputMask />').hasInput).toBe(false);
  });

  it('упоминание в комментарии полем не считается', () => {
    expect(scanKeyboardSafety('// тут был TextInput').hasInput).toBe(false);
  });

  it('обёртка засчитывается по разметке', () => {
    expect(
      scanKeyboardSafety('<KeyboardAvoidingView behavior="padding">').wrappers,
    ).toContain('KeyboardAvoidingView');
    expect(scanKeyboardSafety('<KeyboardAwareScrollView />').hasWrapper).toBe(true);
  });

  it('одного импорта мало: обёртку надо ещё и поставить', () => {
    // Мутация «заменил обёртку на голый ScrollView, импорт оставил» иначе
    // проходит молча — так и было найдено.
    const importedButUnused =
      "import { PersonKeyboardAwareScroll } from '@/components/keyboard-controller-web';\n<ScrollView><TextInput /></ScrollView>";
    expect(scanKeyboardSafety(importedButUnused).hasWrapper).toBe(false);
    expect(
      keyboardViolations([{ file: 'x.tsx', source: importedButUnused }]),
    ).toHaveLength(1);
  });

  it('обычный ScrollView обёрткой не считается', () => {
    const naive = '<ScrollView keyboardShouldPersistTaps="handled"><TextInput /></ScrollView>';
    expect(scanKeyboardSafety(naive).hasWrapper).toBe(false);
    expect(keyboardViolations([{ file: 'x.tsx', source: naive }])).toHaveLength(1);
  });

  it('список принятых обёрток непустой — иначе сторож пропускает всё', () => {
    expect(KEYBOARD_SAFE_WRAPPERS.length).toBeGreaterThanOrEqual(2);
  });

  it('сообщение о нарушении называет файл', () => {
    const [message] = keyboardViolations([
      { file: 'app/some/screen.tsx', source: '<TextInput />' },
    ]);
    expect(message).toContain('app/some/screen.tsx');
  });
});
