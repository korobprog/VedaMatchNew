import { stripJsonFence } from './chat-json';

describe('stripJsonFence', () => {
  it('снимает markdown-ограждение с указанием языка', () => {
    expect(stripJsonFence('```json\n{"ok":true}\n```')).toBe('{"ok":true}');
  });

  it('снимает ограждение без языка', () => {
    expect(stripJsonFence('```\n{"ok":true}\n```')).toBe('{"ok":true}');
  });

  it('обычный ответ не трогает', () => {
    expect(stripJsonFence(' {"ok":true} ')).toBe('{"ok":true}');
  });

  it('не портит строку с обратными кавычками внутри значения', () => {
    expect(stripJsonFence('{"reason":"код ```"}')).toBe('{"reason":"код ```"}');
  });
});
