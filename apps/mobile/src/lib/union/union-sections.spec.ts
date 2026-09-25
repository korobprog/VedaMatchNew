import fs from 'node:fs';
import path from 'node:path';
import { UNION_SECTIONS, badgeText } from './union-sections';

describe('разделы Знакомств', () => {
  it('у каждого раздела есть свой экран в приложении', () => {
    for (const section of UNION_SECTIONS) {
      const file = path.join(__dirname, '../../app', `${section.route}.tsx`);
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it('чатов Знакомств среди разделов нет — переписка одна, в «Чатах»', () => {
    expect(UNION_SECTIONS.map((section) => section.route)).not.toContain('/union/chats');
  });

  it('ключи разделов не повторяются', () => {
    const keys = UNION_SECTIONS.map((section) => section.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('badgeText', () => {
  it('ноль и мусор — без счётчика, много — «99+»', () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(Number.NaN)).toBeNull();
    expect(badgeText(3)).toBe('3');
    expect(badgeText(120)).toBe('99+');
  });
});
