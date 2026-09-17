import { decideSdpApply } from './webrtc-signal-guard';

describe('decideSdpApply', () => {
  describe('offer', () => {
    it('stable — обычный офер, применяем', () => {
      expect(decideSdpApply('offer', 'stable')).toBe('apply');
    });

    it('have-remote-offer — второй офер до ответа на первый, применяем', () => {
      expect(decideSdpApply('offer', 'have-remote-offer')).toBe('apply');
    });

    it('have-local-offer — glare (сами уже offer’нули), игнорируем', () => {
      expect(decideSdpApply('offer', 'have-local-offer')).toBe('ignore-glare');
    });

    it('closed — неожиданное состояние, игнорируем', () => {
      expect(decideSdpApply('offer', 'closed')).toBe('ignore-unexpected-state');
    });
  });

  describe('answer', () => {
    it('have-local-offer — единственное валидное состояние, применяем', () => {
      expect(decideSdpApply('answer', 'have-local-offer')).toBe('apply');
    });

    it('stable — переговоры уже завершены (дубль/поздний ответ), игнорируем', () => {
      expect(decideSdpApply('answer', 'stable')).toBe('ignore-unexpected-state');
    });

    it('have-remote-offer — мы сами вызываемый, answer тут бессмыслен, игнорируем', () => {
      expect(decideSdpApply('answer', 'have-remote-offer')).toBe('ignore-unexpected-state');
    });

    it('closed — игнорируем', () => {
      expect(decideSdpApply('answer', 'closed')).toBe('ignore-unexpected-state');
    });
  });
});
