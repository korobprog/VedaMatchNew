import fs from 'node:fs';
import path from 'node:path';
import { QUICK_BAR_TABS } from '@/lib/services/quick-bar-placement';
import { MAIN_TABS } from './main-tabs';

const TABS_DIR = path.join(__dirname, '..', '..', 'app', '(tabs)');

describe('нижнее меню', () => {
  it('порядок: Чаты · Звонки · Сервисы · Люди · Общины — «Сервисы» по центру', () => {
    expect(MAIN_TABS.map((tab) => tab.title)).toEqual(['Чаты', 'Звонки', 'Сервисы', 'Люди', 'Общины']);
    expect(MAIN_TABS[Math.floor(MAIN_TABS.length / 2)].name).toBe('services');
  });

  it('«Чаты» первыми — с них приложение открывается', () => {
    expect(MAIN_TABS[0].name).toBe('index');
  });

  it('у каждой вкладки есть файл экрана, и лишних файлов нет', () => {
    const screens = fs
      .readdirSync(TABS_DIR)
      .filter((name) => name.endsWith('.tsx') && !name.startsWith('_') && !name.includes('.spec.'))
      .map((name) => name.replace(/\.tsx$/, ''))
      .sort();
    expect(MAIN_TABS.map((tab) => tab.name).sort()).toEqual(screens);
  });

  it('раскладка вкладок объявляет экраны по этому списку, а не своим', () => {
    const layout = fs.readFileSync(path.join(TABS_DIR, '_layout.tsx'), 'utf8');
    expect(layout).toMatch(/MAIN_TABS\.map\(/);
    expect(layout).not.toMatch(/name="(index|calls|services|people|communities)"/);
  });

  it('список вкладок панели быстрого доступа идёт в том же порядке', () => {
    expect([...QUICK_BAR_TABS]).toEqual(MAIN_TABS.map((tab) => tab.name));
  });
});
