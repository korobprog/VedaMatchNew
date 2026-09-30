import { BadRequestException } from '@nestjs/common';
import { BLOG_ABOUT_MAX_LENGTH } from '@vedamatch/shared';
import { parseBlogAbout } from './blog-about';

/* VED-686: «О себе» на личной странице. */
describe('parseBlogAbout', () => {
  it('срезает края и лишние пустые строки', () => {
    expect(
      parseBlogAbout({ about: '  Харе Кришна\r\n\n\n\nИз Москвы  ' }),
    ).toBe('Харе Кришна\n\nИз Москвы');
  });

  it('пустое — null, текст стирается', () => {
    expect(parseBlogAbout({ about: '   \n ' })).toBeNull();
  });

  it('не строка и перебор длины — отказ', () => {
    expect(() => parseBlogAbout({ about: 5 })).toThrow(BadRequestException);
    expect(() => parseBlogAbout(null)).toThrow('about_invalid');
    expect(() =>
      parseBlogAbout({ about: 'а'.repeat(BLOG_ABOUT_MAX_LENGTH + 1) }),
    ).toThrow('about_too_long');
  });
});
