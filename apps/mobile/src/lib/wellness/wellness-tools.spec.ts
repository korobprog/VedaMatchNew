import fs from 'node:fs';
import path from 'node:path';
import {
  WELLNESS_SITE_SECTIONS,
  WELLNESS_TOOLS,
  type WellnessTool,
} from './wellness-tools';

const APP = path.join(__dirname, '..', '..', 'app');

describe('WELLNESS_TOOLS', () => {
  it('сканер — первое средство раздела', () => {
    expect(WELLNESS_TOOLS[0].key).toBe('scan');
    expect(WELLNESS_TOOLS[0].route).toBe('/wellness/scan');
  });

  it('у каждого ярлыка есть подпись и объяснение', () => {
    for (const tool of WELLNESS_TOOLS) {
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.text.length).toBeGreaterThan(20);
    }
  });

  it('ключи не повторяются', () => {
    const keys = WELLNESS_TOOLS.map((tool) => tool.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * Главная проверка: ярлык ведёт на существующий экран. Плитка, открывающая
   * пустоту, хуже отсутствующей — человек нажимает и получает белый экран.
   */
  it.each(WELLNESS_TOOLS as WellnessTool[])(
    'ярлык «$title» ведёт на настоящий маршрут приложения',
    (tool) => {
      expect(tool.route.startsWith('/')).toBe(true);
      const file = path.join(APP, `${tool.route.replace(/^\//, '')}.tsx`);
      const index = path.join(APP, tool.route.replace(/^\//, ''), 'index.tsx');
      expect(fs.existsSync(file) || fs.existsSync(index)).toBe(true);
    },
  );

  it('каждый маршрут ярлыка зарегистрирован в корневом стеке', () => {
    // Незарегистрированный экран открывается, но без него ломается
    // предсказуемость «назад»: правило проекта — все маршруты перечислены в
    // `components/root-shell-stack.tsx`.
    const stack = fs.readFileSync(
      path.join(__dirname, '..', '..', 'components', 'root-shell-stack.tsx'),
      'utf8',
    );
    for (const tool of WELLNESS_TOOLS) {
      expect(stack).toContain(`name="${tool.route.replace(/^\//, '')}"`);
    }
  });

  it('экран раздела не перечисляет средства вручную, а читает список', () => {
    // Сторож против «добавил строку в данные, а на экране её нет»: если экран
    // перестал читать `WELLNESS_TOOLS`, следующее средство молча не появится.
    const screen = fs.readFileSync(path.join(APP, 'wellness', 'index.tsx'), 'utf8');
    expect(screen).toContain('WELLNESS_TOOLS');
    for (const tool of WELLNESS_TOOLS) {
      // Подписи в разметке быть не должно — она приходит из данных.
      expect(screen).not.toContain(tool.title);
    }
  });
});

describe('WELLNESS_SITE_SECTIONS', () => {
  it('ограничения названы первыми: без них вердикт считается по умолчанию', () => {
    expect(WELLNESS_SITE_SECTIONS[0].key).toBe('diet');
  });

  it('это пути сайта, а не маршруты приложения', () => {
    for (const section of WELLNESS_SITE_SECTIONS) {
      expect(section.path.startsWith('/wellness/')).toBe(true);
      // Ни один из них не должен совпасть с ярлыком приложения, иначе одно и
      // то же средство предлагается дважды и по-разному.
      expect(WELLNESS_TOOLS.some((tool) => tool.route === section.path)).toBe(
        false,
      );
    }
  });
});
