import { applyVoiceTranscription } from './voice-transcription';

/** Знак ударения ставится сразу за ударной гласной. */
const S = '́';

describe('applyVoiceTranscription', () => {
  it('ставит ударение и сохраняет падежное окончание', () => {
    expect(applyVoiceTranscription('Кришна учит')).toBe(`Кри${S}шна учит`);
    expect(applyVoiceTranscription('беседа в Маяпуре')).toBe(
      `беседа в Маяпу${S}ре`,
    );
  });

  it('оставляет «Арджуне» без пометки: со знаком слышится «АрджунЭ»', () => {
    expect(applyVoiceTranscription('Кришна объясняет Арджуне')).toBe(
      `Кри${S}шна объясняет Арджуне`,
    );
  });

  it('справляется с составным названием', () => {
    expect(applyVoiceTranscription('Бхагавад-гита как она есть')).toBe(
      `Бхагава${S}д-Ги${S}та как она есть`,
    );
  });

  it('не трогает слова, которые лишь начинаются так же', () => {
    // Ровно ради этого окончания перечислены списком: без него основа
    // совпадала бы внутри любого слова и словарь портил бы текст молча.
    const words = ['Кришнаит', 'дхармический', 'вайшнавизм'];
    // Сравниваем списками, чтобы в отчёте было видно, какое слово испортилось.
    expect(words.map(applyVoiceTranscription)).toEqual(words);
  });

  it('не лезет внутрь слова', () => {
    expect(applyVoiceTranscription('некришна')).toBe('некришна');
  });

  it('сохраняет регистр исходного слова', () => {
    expect(applyVoiceTranscription('Киртан начался')).toBe(
      `Кирта${S}н начался`,
    );
    expect(applyVoiceTranscription('пели киртан')).toBe(`пели кирта${S}н`);
  });

  it('обрабатывает всю строку, а не первое совпадение', () => {
    const out = applyVoiceTranscription('Кришна и Кришна, а также Кришне');
    expect(out.split(`Кри${S}шн`).length - 1).toBe(3);
  });

  it('текст без знакомых слов оставляет как есть', () => {
    const plain = 'Ценность действия определяется его целью.';
    expect(applyVoiceTranscription(plain)).toBe(plain);
  });

  it('не добавляет ударение дважды при повторном прогоне', () => {
    // Пайплайн может пройти по тексту не один раз — двойной знак сломал бы
    // произношение вместо того, чтобы помочь.
    const once = applyVoiceTranscription('Кришна');
    expect(applyVoiceTranscription(once)).toBe(once);
  });
});
