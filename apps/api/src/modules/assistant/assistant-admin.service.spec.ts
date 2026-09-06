import { BadRequestException } from '@nestjs/common';
import { parsePatch } from './assistant-admin.service';

describe('parsePatch', () => {
  it('пропускает только известные поля нужных типов', () => {
    expect(
      parsePatch({
        enabled: false,
        dailyMessagesPerUser: 5,
        systemPromptExtra: '  Будь краток.  ',
        // @ts-expect-error — лишнее поле от старого клиента
        unknown: 1,
      }),
    ).toEqual({
      enabled: false,
      dailyMessagesPerUser: 5,
      systemPromptExtra: 'Будь краток.',
    });
  });

  it('ловит опечатки: не число, дробь, выход за границы', () => {
    // @ts-expect-error — строка вместо числа
    expect(() => parsePatch({ dailyTokenBudget: '100' })).toThrow(
      BadRequestException,
    );
    expect(() => parsePatch({ dailyTokenBudget: 1.5 })).toThrow('целым');
    expect(() => parsePatch({ maxToolRounds: 99 })).toThrow('от 0 до 8');
    // @ts-expect-error — строка вместо логического
    expect(() => parsePatch({ aiEnabled: 'yes' })).toThrow('логическим');
  });

  it('дополнение к промпту режется по длине', () => {
    expect(
      parsePatch({ systemPromptExtra: 'x'.repeat(5000) }).systemPromptExtra,
    ).toHaveLength(4000);
  });
});
