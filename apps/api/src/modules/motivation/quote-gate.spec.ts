import { MotivationGenerationService } from './motivation-generation.service';

function buildService(reply: unknown | Error) {
  const service = new MotivationGenerationService({
    get: jest.fn(),
  } as never);
  const request = jest.spyOn(
    service as unknown as {
      requestStructuredChat: (prompt: string) => Promise<unknown>;
    },
    'requestStructuredChat',
  );
  if (reply instanceof Error) request.mockRejectedValue(reply);
  else request.mockResolvedValue(reply);
  return { service, request };
}

const sentences = [
  'Мукунда облачился в мантию волшебника Мерлина.',
  'Смирение означает, что человек не считает себя выше других.',
  'Преданность начинается там, где ум перестаёт искать выгоду.',
];

describe('selectQuotableSentences', () => {
  it('keeps only the indices the model returned', async () => {
    const { service } = buildService({ keep: [1, 2] });

    await expect(service.selectQuotableSentences(sentences)).resolves.toEqual([
      sentences[1],
      sentences[2],
    ]);
  });

  it('returns nothing when the model rejects everything', async () => {
    const { service } = buildService({ keep: [] });

    await expect(service.selectQuotableSentences(sentences)).resolves.toEqual([]);
  });

  it('ignores indices outside the list instead of returning undefined', async () => {
    const { service } = buildService({ keep: [0, 99, -1, 1.5] });

    await expect(service.selectQuotableSentences(sentences)).resolves.toEqual([
      sentences[0],
    ]);
  });

  it('lets everything through when the provider fails', async () => {
    // Молча обнулить подбор хуже, чем пропустить слабую цитату: её ещё
    // отсеет проверка администратором.
    const { service } = buildService(new Error('provider down'));

    await expect(service.selectQuotableSentences(sentences)).resolves.toEqual(
      sentences,
    );
  });

  it('lets everything through when the answer has no keep list', async () => {
    const { service } = buildService({ unexpected: true });

    await expect(service.selectQuotableSentences(sentences)).resolves.toEqual(
      sentences,
    );
  });

  it('does not call the provider for an empty list', async () => {
    const { service, request } = buildService({ keep: [] });

    await expect(service.selectQuotableSentences([])).resolves.toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });
});
