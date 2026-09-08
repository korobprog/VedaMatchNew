#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ConfigError, readConfig } from './config.js';
import { PortalClient, PortalError } from './portal-client.js';

/**
 * MCP-сервер портала VedaMatch: доски и задачи сервиса «Работа».
 *
 * Набор инструментов намеренно узкий — чтение плюс то, что можно поправить
 * руками: создать задачу, изменить её, перенести, прокомментировать. Ни
 * удаления, ни архива, ни приглашений: доска — общая, а модель ошибается молча
 * и быстрее, чем человек успевает возразить. Расширять его стоит тогда, когда
 * станет понятно, чего в работе не хватает, а не заранее.
 */
const server = new McpServer({
  name: 'vedamatch-mcp-server',
  version: '0.0.1',
});

let portal: PortalClient;
try {
  portal = new PortalClient(readConfig(process.env));
} catch (error) {
  // Единственный читатель — человек, настраивающий клиент, и увидит он только
  // stderr: по протоколу stdout занят обменом сообщениями и засорять его нельзя.
  process.stderr.write(
    `${error instanceof ConfigError ? error.message : String(error)}\n`,
  );
  process.exit(1);
}

/** Единый вид ответа: текст для чтения и те же данные для разбора. */
function reply(data: unknown) {
  const text = JSON.stringify(data, null, 2);
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: { result: data },
  };
}

/**
 * Отказ портала — это результат вызова, а не поломка сервера: модель должна
 * прочитать причину и поправиться, а не потерять соединение.
 */
async function attempt(action: () => Promise<unknown>) {
  try {
    return reply(await action());
  } catch (error) {
    const message =
      error instanceof PortalError ? error.message : `Не удалось: ${String(error)}`;
    return {
      content: [{ type: 'text' as const, text: message }],
      isError: true,
    };
  }
}

const resultShape = { result: z.unknown() };

server.registerTool(
  'work_list_spaces',
  {
    title: 'Рабочие среды',
    description:
      'Список рабочих сред портала с досками. С этого начинается любая работа: идентификаторы досок берутся отсюда.',
    inputSchema: {},
    outputSchema: resultShape,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  () => attempt(() => portal.get('/work/spaces')),
);

server.registerTool(
  'work_get_space',
  {
    title: 'Рабочая среда',
    description:
      'Одна среда целиком: её доски, участники и роли. Нужна, чтобы узнать boardId для work_get_board.',
    inputSchema: {
      spaceId: z.string().describe('Идентификатор среды из work_list_spaces'),
    },
    outputSchema: resultShape,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ({ spaceId }) => attempt(() => portal.get(`/work/spaces/${spaceId}`)),
);

server.registerTool(
  'work_get_board',
  {
    title: 'Доска',
    description:
      'Доска с колонками и карточками: что в какой колонке лежит, кто исполнитель, какие сроки. Основной способ увидеть текущее состояние дел.',
    inputSchema: {
      boardId: z.string().describe('Идентификатор доски из work_get_space'),
    },
    outputSchema: resultShape,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ({ boardId }) => attempt(() => portal.get(`/work/boards/${boardId}`)),
);

server.registerTool(
  'work_get_task',
  {
    title: 'Карточка задачи',
    description:
      'Одна задача подробно: описание, чек-лист, комментарии, вложения, история переносов.',
    inputSchema: {
      taskId: z.string().describe('Идентификатор задачи с доски'),
    },
    outputSchema: resultShape,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ({ taskId }) => attempt(() => portal.get(`/work/tasks/${taskId}`)),
);

server.registerTool(
  'work_get_agenda',
  {
    title: 'Мой день',
    description:
      'Задачи со сроками по всем средам сразу: просроченное, сегодняшнее, ближайшее. Отвечает на вопрос «что горит», не требуя обхода досок.',
    inputSchema: {},
    outputSchema: resultShape,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  () => attempt(() => portal.get('/work/agenda')),
);

server.registerTool(
  'work_create_task',
  {
    title: 'Завести задачу',
    description:
      'Создать карточку на доске. Попадает в первую колонку; исполнителя и срок можно указать сразу или проставить потом через work_update_task.',
    inputSchema: {
      boardId: z.string().describe('Доска, на которой заводится задача'),
      title: z.string().min(1).max(200).describe('Название задачи'),
      description: z.string().max(5000).optional(),
      assigneeId: z
        .string()
        .optional()
        .describe('Исполнитель: идентификатор участника из work_get_space'),
      dueAt: z
        .string()
        .optional()
        .describe('Срок в формате ISO 8601, например 2026-09-15T12:00:00.000Z'),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    },
    outputSchema: resultShape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  ({ boardId, ...body }) =>
    attempt(() => portal.post(`/work/boards/${boardId}/tasks`, body)),
);

server.registerTool(
  'work_update_task',
  {
    title: 'Изменить задачу',
    description:
      'Поправить название, описание, исполнителя, срок или важность. Передавайте только те поля, которые меняете.',
    inputSchema: {
      taskId: z.string(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      assigneeId: z
        .string()
        .nullable()
        .optional()
        .describe('null снимает исполнителя'),
      dueAt: z.string().nullable().optional().describe('null снимает срок'),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    },
    outputSchema: resultShape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  ({ taskId, ...body }) =>
    attempt(() => portal.patch(`/work/tasks/${taskId}`, body)),
);

server.registerTool(
  'work_move_task',
  {
    title: 'Перенести задачу',
    description:
      'Переложить карточку в другую колонку — «в работу», «на тестирование», «готово». Соседей указывать не обязательно: без них карточка встаёт в конец колонки. Участники узнают о переносе не сразу: у автора есть несколько минут передумать.',
    inputSchema: {
      taskId: z.string(),
      columnId: z.string().describe('Колонка назначения из work_get_board'),
      afterTaskId: z
        .string()
        .optional()
        .describe('Встать сразу после этой карточки'),
      beforeTaskId: z
        .string()
        .optional()
        .describe('Встать сразу перед этой карточкой'),
    },
    outputSchema: resultShape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  ({ taskId, ...body }) =>
    attempt(() => portal.post(`/work/tasks/${taskId}/move`, body)),
);

server.registerTool(
  'work_comment_task',
  {
    title: 'Комментарий к задаче',
    description:
      'Написать в карточку. Комментарий виден всем участникам среды и приходит уведомлением автору и исполнителю — это разговор с людьми, а не заметка для себя.',
    inputSchema: {
      taskId: z.string(),
      body: z.string().min(1).max(4000).describe('Текст комментария'),
    },
    outputSchema: resultShape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  ({ taskId, body }) =>
    attempt(() => portal.post(`/work/tasks/${taskId}/comments`, { body })),
);

const transport = new StdioServerTransport();
await server.connect(transport);
