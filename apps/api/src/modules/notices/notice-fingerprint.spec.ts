import { noticeFingerprint } from './notice-fingerprint';

const base = {
  kind: 'offer',
  rubricId: 'r1',
  title: 'Отдам холодильник',
  description: 'Работает, самовывоз',
};

describe('noticeFingerprint', () => {
  it('не различает регистр, пунктуацию и лишние пробелы', () => {
    expect(noticeFingerprint(base)).toBe(
      noticeFingerprint({
        ...base,
        title: '  ОТДАМ   ХОЛОДИЛЬНИК!!! ',
        description: 'Работает — самовывоз.',
      }),
    );
  });

  it('не путает ё и е', () => {
    expect(noticeFingerprint({ ...base, title: 'Приём вещей' })).toBe(
      noticeFingerprint({ ...base, title: 'Прием вещей' }),
    );
  });

  it('«ищу» и «отдам» с одним текстом — разные объявления', () => {
    // Вид входит в отпечаток, иначе просьба схлопнулась бы с предложением.
    expect(noticeFingerprint({ ...base, kind: 'request' })).not.toBe(
      noticeFingerprint(base),
    );
  });

  it('рубрика тоже различает', () => {
    expect(noticeFingerprint({ ...base, rubricId: 'r2' })).not.toBe(
      noticeFingerprint(base),
    );
  });

  it('разный текст даёт разный отпечаток', () => {
    expect(noticeFingerprint({ ...base, title: 'Отдам стиральную' })).not.toBe(
      noticeFingerprint(base),
    );
  });

  it('переживает пустые поля', () => {
    expect(noticeFingerprint({ kind: 'info', rubricId: 'r1' })).toHaveLength(
      32,
    );
  });
});
