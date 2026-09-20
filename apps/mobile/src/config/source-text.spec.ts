import { stripComments } from './source-text';

describe('stripComments', () => {
  it('убирает строчный комментарий, оставляя код строки', () => {
    const source = 'const a = 1; // тариф 108 ₽';
    const stripped = stripComments(source);
    expect(stripped.trimEnd()).toBe('const a = 1;');
    // Длина сохраняется: смещения в сообщении проверки должны совпадать с файлом.
    expect(stripped).toHaveLength(source.length);
  });

  it('убирает блочный комментарий', () => {
    const stripped = stripComments('a/* оплатить */b');
    expect(stripped).toHaveLength('a/* оплатить */b'.length);
    expect(stripped.replace(/ /g, '')).toBe('ab');
  });

  it('сохраняет количество строк и их нумерацию', () => {
    const source = ['/**', ' * купить', ' */', "const x = 1;"].join('\n');
    const stripped = stripComments(source);
    expect(stripped.split('\n')).toHaveLength(4);
    expect(stripped.split('\n')[3]).toBe('const x = 1;');
    expect(stripped).not.toContain('купить');
  });

  it('не режет строку с адресом — двойной слэш внутри кавычек это не комментарий', () => {
    const source = "const url = 'https://vedamatch.ru/billing';";
    expect(stripComments(source)).toBe(source);
  });

  it('не трогает шаблонные литералы', () => {
    const source = 'const u = `${base}/mobile/android/${c}/latest.json`;';
    expect(stripComments(source)).toBe(source);
  });

  it('экранированная кавычка не закрывает строку', () => {
    const source = "const s = 'не \\' конец // всё ещё строка';";
    expect(stripComments(source)).toBe(source);
  });

  it('слэш регулярки не принимается за комментарий', () => {
    const source = "value.replace(/\\/+$/, '');";
    expect(stripComments(source)).toBe(source);
  });

  it('код после блочного комментария сохраняется', () => {
    expect(stripComments('/* тариф */ const price = 1;')).toContain('const price = 1;');
  });

  it('пустой исходник остаётся пустым', () => {
    expect(stripComments('')).toBe('');
  });
});
