import { confirmButtonPalette } from './confirm-dialog-style';

const colors = { magenta: '#E4187F', text0: '#180F2C', glassBorder: 'rgba(0,0,0,0.14)' };

describe('confirmButtonPalette', () => {
  it('опасное действие — акцент magenta', () => {
    expect(confirmButtonPalette(true, colors)).toEqual({
      border: colors.magenta,
      text: colors.magenta,
    });
  });

  it('обычное действие — нейтральные text0/glassBorder', () => {
    expect(confirmButtonPalette(false, colors)).toEqual({
      border: colors.glassBorder,
      text: colors.text0,
    });
  });
});
