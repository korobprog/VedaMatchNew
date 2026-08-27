import {
  BookOpen,
  Check,
  Drum,
  GraduationCap,
  Heart,
  Search,
  Send,
  ShoppingCart,
  Star,
  X,
} from "lucide-react";

/**
 * Мини-экраны сервисов для ролика в макете портала. Живут отдельным файлом:
 * это макетная бутафория, и держать её вместе с логикой обхода — значит
 * прятать сорок строк механики за двумя сотнями строк разметки.
 *
 * Содержимое целиком декоративно и лежит внутри `aria-hidden` макета, поэтому
 * здесь нет ни заголовков, ни ссылок: заголовок сломал бы порядок h1→h2→h3, а
 * настоящие ссылки на сервисы гость получает разделом ниже.
 *
 * Цифры и подписи — правдоподобная выдумка, но не выдуманный функционал:
 * каждый экран показывает ровно то, что сервис умеет на самом деле (см.
 * lib/service-content.ts).
 */

/** Общая рамка карточки: стекло портала, как во всех разделах. */
const CARD = "rounded-xl border border-glass-brd bg-glass";

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-glass-brd px-1.5 py-px text-[8px] leading-relaxed text-text-1">
      {children}
    </span>
  );
}

/**
 * Полоска критерия совместимости. Ширина приходит числом, а не готовым
 * классом: Tailwind не соберёт класс, собранный в рантайме из переменной.
 */
function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-[52px] shrink-0 text-[8px] text-text-2">{label}</span>
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-bg-2">
        <span className="block h-full rounded-full bg-mint" style={{ width: `${value}%` }} />
      </span>
      <span className="w-[20px] shrink-0 text-right text-[8px] font-semibold text-text-1">
        {value}%
      </span>
    </div>
  );
}

/** Знакомства: карточка совпадения и разбор процента по критериям. */
export function UnionScreen() {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className={`${CARD} flex gap-2.5 p-2`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/profiles/maria.jpg"
          alt=""
          className="h-[86px] w-[66px] shrink-0 rounded-lg object-cover"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[11px] font-semibold text-text-0">Мария, 26</span>
            <span className="rounded-full bg-mint px-1.5 py-px text-[9px] font-bold leading-relaxed text-on-mint">
              94%
            </span>
          </div>
          <span className="mt-0.5 text-[9px] text-text-2">Санкт-Петербург · 12 км</span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Tag>Киртан</Tag>
            <Tag>Служение</Tag>
            <Tag>Аюрведа</Tag>
          </div>
          <div className="mt-auto flex items-center gap-1.5 pt-2">
            <span className="flex size-6 items-center justify-center rounded-full border border-glass-brd text-text-2">
              <X className="size-3" />
            </span>
            <span className="flex size-6 items-center justify-center rounded-full border border-glass-brd text-gold">
              <Star className="size-3" />
            </span>
            <span className="flex size-6 items-center justify-center rounded-full bg-magenta text-white">
              <Heart className="size-3" />
            </span>
          </div>
        </div>
      </div>

      <div className={`${CARD} flex flex-col gap-1.5 p-2`}>
        <span className="text-[9px] font-semibold text-text-1">Почему 94%</span>
        <Meter label="Намерения" value={96} />
        <Meter label="Ценности" value={92} />
        <Meter label="Путь" value={88} />
        <Meter label="Локация" value={74} />
      </div>
    </div>
  );
}

/** Общение: диалог и поле ввода — первая переписка уже согласована. */
export function ChatScreen() {
  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex items-center gap-2 pb-0.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/profiles/alexandra.jpg"
          alt=""
          className="size-6 rounded-full object-cover"
        />
        <div className="flex min-w-0 flex-col">
          <span className="text-[10px] font-semibold leading-tight text-text-0">
            Александра
          </span>
          <span className="text-[8px] leading-tight text-mint">в сети</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="max-w-[78%] self-start rounded-xl rounded-bl-sm border border-glass-brd bg-glass px-2 py-1.5 text-[9px] leading-snug text-text-0">
          Харе Кришна! Видела, вы ездили на Гаура-Пурниму в Маяпур
        </span>
        <span className="max-w-[78%] self-end rounded-xl rounded-br-sm bg-mint px-2 py-1.5 text-[9px] leading-snug text-on-mint">
          Да, второй год подряд. В этот раз с группой из Петербурга
        </span>
        <span className="max-w-[78%] self-start rounded-xl rounded-bl-sm border border-glass-brd bg-glass px-2 py-1.5 text-[9px] leading-snug text-text-0">
          Расскажете, как всё устроено? Собираемся весной
        </span>
        <span className="flex items-center gap-1 self-start rounded-xl rounded-bl-sm border border-glass-brd bg-glass px-2.5 py-2">
          <span className="size-1 rounded-full bg-text-2" />
          <span className="size-1 rounded-full bg-text-2" />
          <span className="size-1 rounded-full bg-text-2" />
        </span>
      </div>

      <div
        className={`${CARD} mt-auto flex items-center justify-between gap-2 px-2 py-1.5`}
      >
        <span className="text-[9px] text-text-2">Сообщение…</span>
        <span className="flex size-5 items-center justify-center rounded-full bg-mint text-on-mint">
          <Send className="size-2.5" />
        </span>
      </div>
    </div>
  );
}

/**
 * Астрология: северо-индийская карта — квадрат с диагоналями и повёрнутым
 * внутренним ромбом, как её чертят в джйотише.
 */
function NatalChart() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="size-[78px] shrink-0 text-cyan"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <rect x="2" y="2" width="60" height="60" rx="2" />
      <path d="M2 2 62 62M62 2 2 62" />
      <path d="M32 2 62 32 32 62 2 32Z" />
    </svg>
  );
}

export function AstroScreen() {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className={`${CARD} flex items-center gap-2.5 p-2`}>
        <NatalChart />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-[9px] text-text-2">Лагна</span>
            <span className="text-[9px] font-semibold text-text-0">Дхану</span>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-[9px] text-text-2">Накшатра Луны</span>
            <span className="text-[9px] font-semibold text-text-0">Рохини</span>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-[9px] text-text-2">Текущая даша</span>
            <span className="text-[9px] font-semibold text-text-0">Гуру</span>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-[9px] text-text-2">до</span>
            <span className="text-[9px] font-semibold text-text-1">апр 2029</span>
          </div>
        </div>
      </div>

      <div className={`${CARD} flex flex-col gap-1.5 p-2`}>
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-semibold text-text-1">Гуна-Милан</span>
          <span className="rounded-full bg-mint px-1.5 py-px text-[9px] font-bold leading-relaxed text-on-mint">
            28 / 36
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[
            ["Варна", "1"],
            ["Вашья", "2"],
            ["Тара", "3"],
            ["Йони", "4"],
            ["Майтри", "5"],
            ["Гана", "6"],
            ["Бхакут", "7"],
            ["Нади", "0"],
          ].map(([name, score]) => (
            <span
              key={name}
              className="flex flex-col items-center gap-0.5 rounded-lg border border-glass-brd px-0.5 py-1"
            >
              <span className="text-[9px] font-bold text-text-0">{score}</span>
              <span className="text-[7px] leading-none text-text-2">{name}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Библиотека: глава с комментарием и отметкой, что книга уже без сети. */
export function VedabaseScreen() {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className={`${CARD} flex items-center gap-2 px-2 py-1.5`}>
        <Search className="size-3 shrink-0 text-text-2" />
        <span className="text-[9px] text-text-2">Поиск по тексту</span>
      </div>

      <div className={`${CARD} flex flex-col gap-1.5 p-2`}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <BookOpen className="size-3 text-violet" />
            <span className="text-[10px] font-semibold text-text-0">
              Бхагавад-гита 2.47
            </span>
          </span>
          <span className="flex items-center gap-1 rounded-full bg-mint px-1.5 py-px text-[8px] font-bold leading-relaxed text-on-mint">
            <Check className="size-2" />
            офлайн
          </span>
        </div>
        <p className="text-[9px] leading-snug text-text-1">
          «Ты можешь выполнять предписанные обязанности, но не претендуй на плоды
          труда. Пусть плоды не станут причиной твоих действий…»
        </p>
        <div className="flex items-center gap-1.5 pt-0.5">
          <Tag>комментарий</Tag>
          <Tag>санскрит</Tag>
          <Tag>пословный</Tag>
        </div>
      </div>

      <div className={`${CARD} flex flex-col gap-1 p-2`}>
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-text-2">Глава 2 · Обзор Бхагавад-гиты</span>
          <span className="text-[9px] font-semibold text-text-1">47 / 72</span>
        </div>
        <span className="h-1 overflow-hidden rounded-full bg-bg-2">
          <span className="block h-full w-[65%] rounded-full bg-violet" />
        </span>
      </div>
    </div>
  );
}

/** Рынок: витрина с ценой и корзина — заказ оформляется внутри портала. */
export function MarketScreen() {
  const items = [
    {
      title: "Мриданга, клён",
      price: "24 000 ₽",
      note: "Вриндаван · доставка",
      accent: "text-gold",
      Icon: Drum,
    },
    {
      title: "Курс аюрведы",
      price: "6 500 ₽",
      note: "8 занятий · онлайн",
      accent: "text-violet",
      Icon: GraduationCap,
    },
  ];

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.title} className={`${CARD} flex flex-col gap-1 p-2`}>
            <span
              className={`flex h-[42px] items-center justify-center rounded-lg bg-bg-2 ${item.accent}`}
            >
              <item.Icon className="size-4" />
            </span>
            <span className="text-[9px] font-semibold leading-tight text-text-0">
              {item.title}
            </span>
            <span className="text-[8px] leading-tight text-text-2">{item.note}</span>
            <span className="text-[10px] font-bold text-text-0">{item.price}</span>
          </div>
        ))}
      </div>

      <div className={`${CARD} flex items-center justify-between gap-2 p-2`}>
        <span className="flex items-center gap-1.5">
          <ShoppingCart className="size-3 text-text-1" />
          <span className="text-[9px] text-text-1">В корзине 2 товара</span>
        </span>
        <span className="rounded-full bg-mint px-2 py-1 text-[9px] font-bold leading-none text-on-mint">
          30 500 ₽
        </span>
      </div>

      <div className={`${CARD} flex items-center gap-2 p-2`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/profiles/ekaterina.jpg"
          alt=""
          className="size-5 rounded-full object-cover"
        />
        <span className="min-w-0 flex-1 truncate text-[9px] text-text-2">
          «Заберёте сами или отправить?»
        </span>
        <span className="rounded-full bg-magenta px-1.5 py-px text-[8px] font-bold leading-relaxed text-white">
          1
        </span>
      </div>
    </div>
  );
}
