import {
  CONTENT_POLICY_CODE,
  isContentPolicyCode,
  videoRejectionMessage,
} from './video-rejection';

describe('isContentPolicyCode', () => {
  it('узнаёт код провайдера', () => {
    expect(isContentPolicyCode(CONTENT_POLICY_CODE)).toBe(true);
  });

  it('находит код внутри длинной строки: в videoErrorCode попадает и текст', () => {
    expect(
      isContentPolicyCode('422 content_policy_violation при разборе'),
    ).toBe(true);
  });

  it('не зависит от регистра', () => {
    expect(isContentPolicyCode('CONTENT_POLICY_VIOLATION')).toBe(true);
  });

  it.each([
    ['другой сбой', 'provider_timeout'],
    ['таймаут заливки', 'Video storage upload failed 408'],
    ['пусто', ''],
    ['null', null],
    ['undefined', undefined],
  ])('не путает %s с отказом по содержанию', (_name, code) => {
    expect(isContentPolicyCode(code)).toBe(false);
  });
});

describe('videoRejectionMessage', () => {
  it('объясняет отказ и не обещает успех при повторе', () => {
    const message = videoRejectionMessage(CONTENT_POLICY_CODE);
    expect(message).toContain('отклонил');
    expect(message).toContain('другой иллюстрацией');
    // Прямо противоположно тому, что автор видел раньше.
    expect(message).not.toContain('попробуйте ещё раз');
  });

  it('молчит на посторонних кодах — сообщение выбирает вызывающий', () => {
    expect(videoRejectionMessage('provider_timeout')).toBeNull();
    expect(videoRejectionMessage(null)).toBeNull();
  });
});
