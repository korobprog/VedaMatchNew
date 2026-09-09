import {
  explanationChanged,
  explanationOf,
  withoutExplanation,
} from './explanation-text';

describe('explanationOf', () => {
  it('берёт часть после пустой строки', () => {
    expect(explanationOf('Цитата\n\nПояснение')).toBe('Пояснение');
  });

  it('без пустой строки пояснения нет', () => {
    expect(explanationOf('Только цитата')).toBe('');
  });

  it('пояснение из двух абзацев остаётся целым', () => {
    expect(explanationOf('Цитата\n\nПервый.\n\nВторой.')).toBe(
      'Первый.\n\nВторой.',
    );
  });
});

describe('explanationChanged', () => {
  it('правка самой цитаты автором трактовки не делает', () => {
    expect(
      explanationChanged('Цитата\n\nПояснение', 'Цитата с опечаткой\n\nПояснение'),
    ).toBe(false);
  });

  it('правка пояснения считается', () => {
    expect(explanationChanged('Цитата\n\nБыло', 'Цитата\n\nСтало')).toBe(true);
  });

  it('добавление пояснения к голой цитате считается', () => {
    expect(explanationChanged('Цитата', 'Цитата\n\nПояснение')).toBe(true);
  });

  it('пробелы по краям смысла не меняют', () => {
    expect(
      explanationChanged('Цитата\n\nПояснение', 'Цитата\n\n  Пояснение  '),
    ).toBe(false);
  });
});

describe('withoutExplanation', () => {
  it('оставляет одну цитату', () => {
    expect(withoutExplanation('Цитата\n\nПояснение')).toBe('Цитата');
  });

  it('голую цитату не трогает', () => {
    expect(withoutExplanation('Только цитата')).toBe('Только цитата');
  });
});
