import { buildNotification } from './notification-copy';
import { NotificationsService } from './notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * VED-320: пометка состояния в ленте — это текущее состояние задачи, а не
 * снимок на дату уведомления.
 *
 * Главное, что здесь проверяется, — что поправка попадает ровно в те записи,
 * которые и рассказывают об этой задаче. Связь между ними одна, адрес карточки,
 * и собирается он в двух местах: при доставке уведомления и при поправке.
 * Разъедутся — поправка промахнётся молча, и жалоба вернётся.
 */
describe('NotificationsService.refreshWorkTaskMark', () => {
  function createService() {
    const calls: Array<{ where: unknown; data: unknown }> = [];
    const prisma = {
      notificationItem: {
        updateMany: (args: { where: unknown; data: unknown }) => {
          calls.push(args);
          return Promise.resolve({ count: 2 });
        },
      },
    } as unknown as PrismaService;
    return { service: new NotificationsService(prisma), calls };
  }

  it('ищет уведомления по тому же адресу, что кладёт доставка', async () => {
    const { service, calls } = createService();
    await service.refreshWorkTaskMark('space-1', 'VED-42', 'testing');

    const delivered = buildNotification({
      name: 'work.task.status-changed',
      recipientId: 'u1',
      spaceId: 'space-1',
      taskKey: 'VED-42',
      taskTitle: 'Починить ссылки',
      fromColumnName: 'В работе',
      toColumnName: 'Тестерование',
      actorName: 'Санкаршан',
      statusMark: 'testing',
    });
    expect(calls).toEqual([
      {
        where: { url: delivered.url, category: 'work' },
        data: { mark: 'testing' },
      },
    ]);
  });

  it('снимает пометку, когда карточка уехала в незнакомую колонку', async () => {
    // Оставить прошлую было бы хуже, чем не показать никакой: прошлая врёт.
    const { service, calls } = createService();
    await service.refreshWorkTaskMark('space-1', 'VED-42', null);
    expect(calls[0]?.data).toEqual({ mark: null });
  });

  it('правит все уведомления о задаче, а не одно', async () => {
    // Поднявшаяся наверх карточка и та же карточка неделю назад — это две
    // записи в ленте, и обе отвечают на вопрос «что с задачей сейчас».
    const { service } = createService();
    expect(await service.refreshWorkTaskMark('space-1', 'VED-42', 'done')).toBe(
      2,
    );
  });

  describe('«Чужое» (VED-320)', () => {
    it('хозяевам — состояние, остальным получателям — «Чужое»', async () => {
      const { service, calls } = createService();
      await service.refreshWorkTaskMark('space-1', 'VED-42', 'testing', [], {
        ownerIds: ['author', 'assignee', 'author'],
      });
      const url = '/work/planner/space-1?task=VED-42';
      expect(calls).toEqual([
        {
          where: {
            url,
            category: 'work',
            userId: { in: ['author', 'assignee'] },
          },
          data: { mark: 'testing' },
        },
        {
          where: {
            url,
            category: 'work',
            userId: { notIn: ['author', 'assignee'] },
          },
          data: { mark: 'foreign' },
        },
      ]);
    });

    it('без списка хозяев «Чужое» не ставится никому', async () => {
      // Задача без исполнителя или издатель старой сборки: пометка одна на всех.
      const { service, calls } = createService();
      await service.refreshWorkTaskMark('space-1', 'VED-42', 'rework');
      expect(calls).toHaveLength(1);
      expect(calls[0]?.where).toEqual({
        url: '/work/planner/space-1?task=VED-42',
        category: 'work',
      });
    });

    it('считает и те, и другие строки', async () => {
      const { service } = createService();
      expect(
        await service.refreshWorkTaskMark('space-1', 'VED-42', 'done', [], {
          ownerIds: ['a'],
        }),
      ).toBe(4);
    });
  });
});
