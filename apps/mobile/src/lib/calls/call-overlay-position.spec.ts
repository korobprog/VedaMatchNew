import {
  ANDROID_HEADER_HEIGHT_DP,
  overlayBottomOffset,
  overlayTopOffset,
  pathnameHasSystemHeader,
  pathnameHasTabBar,
  TAB_BAR_HEIGHT_DP,
} from './call-overlay-position';

describe('pathnameHasSystemHeader', () => {
  it('личная переписка и запросы — есть шапка', () => {
    expect(pathnameHasSystemHeader('/chat/abc123')).toBe(true);
    expect(pathnameHasSystemHeader('/chat/requests')).toBe(true);
  });

  it('карточка общины/человека — есть шапка, список — нет', () => {
    expect(pathnameHasSystemHeader('/communities/abc123')).toBe(true);
    expect(pathnameHasSystemHeader('/communities')).toBe(false);
    expect(pathnameHasSystemHeader('/people/abc123')).toBe(true);
    expect(pathnameHasSystemHeader('/people')).toBe(false);
  });

  it('вкладки и экран звонка — без системной шапки', () => {
    expect(pathnameHasSystemHeader('/')).toBe(false);
    expect(pathnameHasSystemHeader('/calls')).toBe(false);
    expect(pathnameHasSystemHeader('/services')).toBe(false);
    expect(pathnameHasSystemHeader('/call/abc123')).toBe(false);
    expect(pathnameHasSystemHeader('/calls-probe')).toBe(false);
  });
});

describe('pathnameHasTabBar', () => {
  it('пять вкладок — да', () => {
    for (const path of ['/', '/calls', '/people', '/communities', '/services']) {
      expect(pathnameHasTabBar(path)).toBe(true);
    }
  });

  it('карточки, переписка и экран звонка — нет', () => {
    expect(pathnameHasTabBar('/chat/abc123')).toBe(false);
    expect(pathnameHasTabBar('/communities/abc123')).toBe(false);
    expect(pathnameHasTabBar('/people/abc123')).toBe(false);
    expect(pathnameHasTabBar('/call/abc123')).toBe(false);
  });
});

describe('overlayTopOffset', () => {
  it('маршрут с шапкой — safe-area плюс высота шапки', () => {
    expect(overlayTopOffset('/chat/abc123', 40)).toBe(40 + ANDROID_HEADER_HEIGHT_DP);
  });

  it('маршрут без шапки — только safe-area', () => {
    expect(overlayTopOffset('/calls', 40)).toBe(40);
  });
});

describe('overlayBottomOffset', () => {
  it('вкладка — safe-area плюс высота нижнего меню', () => {
    expect(overlayBottomOffset('/calls', 24)).toBe(24 + TAB_BAR_HEIGHT_DP);
  });

  it('не вкладка — только safe-area', () => {
    expect(overlayBottomOffset('/chat/abc123', 24)).toBe(24);
  });
});
