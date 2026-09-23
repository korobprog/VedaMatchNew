import { act, create } from 'react-test-renderer';
import { SearchEntry } from './search-entry';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ __esModule: true, router: { push: (...args: unknown[]) => mockPush(...args) } }));

describe('вход в поиск в шапке «Сервисов»', () => {
  it('объявлен скринридеру поиском и открывает экран поиска', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<SearchEntry />);
    });
    const entry = renderer.root.findByProps({ accessibilityLabel: 'Поиск по VedaMatch' });
    expect(entry.props.accessibilityRole).toBe('search');
    await act(async () => entry.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/search');
  });
});
