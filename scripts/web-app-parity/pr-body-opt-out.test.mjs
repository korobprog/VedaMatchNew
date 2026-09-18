import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOptedOut } from './pr-body-opt-out.mjs';

test('строка есть, значение «нет» → true', () => {
  assert.equal(isOptedOut('Правка вёрстки.\n\nЗатрагивает приложение: нет'), true);
});

test('значение «Нет» с заглавной буквы → true (регистронезависимо)', () => {
  assert.equal(isOptedOut('Затрагивает приложение: Нет'), true);
});

test('значение «no» на английском → true', () => {
  assert.equal(isOptedOut('Affects app parity.\nЗатрагивает приложение: no'), true);
});

test('значение «да» → false', () => {
  assert.equal(isOptedOut('Затрагивает приложение: да, новый экран'), false);
});

test('похожее, но другое слово «net» не путается с «нет»', () => {
  assert.equal(isOptedOut('Затрагивает приложение: net'), false);
});

test('строки нет вовсе → false (по умолчанию заводим карточку)', () => {
  assert.equal(isOptedOut('Просто описание PR без пометки.'), false);
});

test('пустое или не-строковое тело → false', () => {
  assert.equal(isOptedOut(''), false);
  assert.equal(isOptedOut(undefined), false);
  assert.equal(isOptedOut(null), false);
});

test('несколько строк «Затрагивает приложение:» — берётся первая', () => {
  const body = [
    'Затрагивает приложение: нет',
    '',
    'Позже другой абзац по ошибке:',
    'Затрагивает приложение: да',
  ].join('\n');
  assert.equal(isOptedOut(body), true);
});

test('пунктуация сразу после значения не мешает разбору', () => {
  assert.equal(isOptedOut('Затрагивает приложение: нет.'), true);
  assert.equal(isOptedOut('Затрагивает приложение: нет — только вёрстка'), true);
});
