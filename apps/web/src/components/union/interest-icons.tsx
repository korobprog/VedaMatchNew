/**
 * Иконки интересов — свои, а не эмодзи.
 *
 * Эмодзи рисует операционная система: на телефоне выходил разноцветный
 * телеграмный набор, который спорил с карточкой и менялся от устройства к
 * устройству. Линейные иконки на `currentColor` ведут себя предсказуемо и
 * подчиняются теме.
 *
 * Интересы можно вписывать свободно, поэтому карта неполна по определению —
 * своему варианту достаётся «искра».
 */

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Свиток. */
function ScrollGlyph() {
  return (
    <Glyph>
      <path d="M7 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6" />
      <path d="M7 4a2 2 0 0 0-2 2v2h4V6a2 2 0 0 0-2-2Z" />
      <path d="M9 12h7M9 16h5" />
    </Glyph>
  );
}

/** Сидящая фигура: голова и колени. */
function YogaGlyph() {
  return (
    <Glyph>
      <circle cx="12" cy="5.5" r="2.5" />
      <path d="M12 9v5" />
      <path d="M12 14c-3 0-6 2-7 5h14c-1-3-4-5-7-5Z" />
      <path d="M7 12h10" />
    </Glyph>
  );
}

/** Точка в расходящихся волнах. */
function MeditationGlyph() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="2" />
      <path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9" />
      <path d="M4.5 4.5a10.6 10.6 0 0 0 0 15M19.5 4.5a10.6 10.6 0 0 1 0 15" />
    </Glyph>
  );
}

/** Барабан. */
function DrumGlyph() {
  return (
    <Glyph>
      <path d="M6 8c0-1.7 2.7-3 6-3s6 1.3 6 3v8c0 1.7-2.7 3-6 3s-6-1.3-6-3Z" />
      <path d="M6 8c0 1.7 2.7 3 6 3s6-1.3 6-3" />
      <path d="M8 13.5h8" />
    </Glyph>
  );
}

/** Колоннада. */
function ColumnsGlyph() {
  return (
    <Glyph>
      <path d="M3 8 12 3l9 5" />
      <path d="M5 8v10M12 8v10M19 8v10" />
      <path d="M3 20h18" />
    </Glyph>
  );
}

/** Сердце с линией пульса. */
function HealthGlyph() {
  return (
    <Glyph>
      <path d="M12 20s-7-4.4-7-9.3A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.7c0 4.9-7 9.3-7 9.3Z" />
      <path d="M6.5 12.5h2.7l1.3-2 1.8 3.4 1.2-1.4h3" />
    </Glyph>
  );
}

/** Бумажный самолётик. */
function TravelGlyph() {
  return (
    <Glyph>
      <path d="M21 4 3 10.5l6.5 2.6L12 20l3-6.5Z" />
      <path d="m9.5 13.1 5.5-6" />
    </Glyph>
  );
}

/** Две взрослые фигуры и ребёнок. */
function FamilyGlyph() {
  return (
    <Glyph>
      <circle cx="7.5" cy="6" r="2.2" />
      <circle cx="16.5" cy="6" r="2.2" />
      <path d="M4 20v-4a3.5 3.5 0 0 1 7 0v4M13 20v-4a3.5 3.5 0 0 1 7 0v4" />
      <circle cx="12" cy="13" r="1.6" />
      <path d="M10 20v-2.5a2 2 0 0 1 4 0V20" />
    </Glyph>
  );
}

/** Раскрытые ладони. */
function ServiceGlyph() {
  return (
    <Glyph>
      <path d="M12 4v6" />
      <path d="M4 11c0 5 3.6 9 8 9s8-4 8-9" />
      <path d="M8 11V8M16 11V8" />
    </Glyph>
  );
}

/** Портфель. */
function BusinessGlyph() {
  return (
    <Glyph>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M3 13h18" />
    </Glyph>
  );
}

/** Академическая шапочка. */
function EducationGlyph() {
  return (
    <Glyph>
      <path d="M12 4 2.5 8.5 12 13l9.5-4.5Z" />
      <path d="M6.5 10.8V16c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-5.2" />
      <path d="M21.5 8.5V14" />
    </Glyph>
  );
}

/** Голова с завитком мысли. */
function PsychologyGlyph() {
  return (
    <Glyph>
      <path d="M15.5 20v-2.6c2.6-1 4.5-3.4 4.5-6.3A7 7 0 0 0 6.4 9.6L4 13.5l2.4.9v2.2a2 2 0 0 0 2 2h1.6V20" />
      <path d="M11 12a2 2 0 1 1 2.6-1.9" />
    </Glyph>
  );
}

/** Ветвь с листьями. */
function HerbGlyph() {
  return (
    <Glyph>
      <path d="M12 21c0-6 2-11 8-14-1 7-3.5 10-8 11Z" />
      <path d="M12 21c0-4-1.4-7.6-5-9.5 1 5 2.4 7.5 5 8.5Z" />
      <path d="M12 21v-3" />
    </Glyph>
  );
}

/** Планета с меридианами. */
function EcologyGlyph() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9.5h17M3.5 14.5h17" />
      <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" />
    </Glyph>
  );
}

/** Кисть. */
function ArtGlyph() {
  return (
    <Glyph>
      <path d="m14.5 6.5 3-3 3 3-3 3Z" />
      <path d="m14.5 9.5-7 7" />
      <path d="M7.5 13.5c-2 0-3.5 1.4-3.5 3.3 0 1-.4 1.8-1 2.4 1 .5 2 .8 3 .8 2.5 0 4.5-1.8 4.5-4.2 0-1.3-1.3-2.3-3-2.3Z" />
    </Glyph>
  );
}

/** Нота. */
function MusicGlyph() {
  return (
    <Glyph>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </Glyph>
  );
}

/** Раскрытая книга. */
function ReadingGlyph() {
  return (
    <Glyph>
      <path d="M12 7c-1.8-1.3-4-2-6.5-2H3v13h2.5c2.5 0 4.7.7 6.5 2 1.8-1.3 4-2 6.5-2H21V5h-2.5c-2.5 0-4.7.7-6.5 2Z" />
      <path d="M12 7v13" />
    </Glyph>
  );
}

/** Храм со шпилем. */
function PilgrimageGlyph() {
  return (
    <Glyph>
      <path d="M12 2v3" />
      <path d="M12 5c-2 2-3 4.3-3 7v8h6v-8c0-2.7-1-5-3-7Z" />
      <path d="M5 20v-5c0-1.6.7-3 2-4M19 20v-5c0-1.6-.7-3-2-4" />
      <path d="M3 20h18" />
    </Glyph>
  );
}

/** Горы. */
function RetreatGlyph() {
  return (
    <Glyph>
      <path d="m2.5 19 6-9.5 4 6 2.5-3.5L21.5 19Z" />
      <path d="m8.5 9.5 2 3M15 12l-1.6 2.3" />
    </Glyph>
  );
}

/** Искра: и заглушка для своего интереса, и значок раздела. */
export function SparkGlyph() {
  return (
    <Glyph>
      <path d="M12 3c.6 4.3 2.1 5.8 6.4 6.4-4.3.6-5.8 2.1-6.4 6.4-.6-4.3-2.1-5.8-6.4-6.4C9.9 8.8 11.4 7.3 12 3Z" />
      <path d="M18 15.5c.3 2 1 2.7 3 3-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.3 2.7-1 3-3Z" />
    </Glyph>
  );
}

const interestGlyphs: Record<
  string,
  (() => React.ReactElement) | undefined
> = {
  философия: ScrollGlyph,
  йога: YogaGlyph,
  медитация: MeditationGlyph,
  киртан: DrumGlyph,
  "ведическая культура": ColumnsGlyph,
  "здоровый образ жизни": HealthGlyph,
  путешествия: TravelGlyph,
  семья: FamilyGlyph,
  служение: ServiceGlyph,
  бизнес: BusinessGlyph,
  образование: EducationGlyph,
  психология: PsychologyGlyph,
  аюрведа: HerbGlyph,
  экология: EcologyGlyph,
  творчество: ArtGlyph,
  музыка: MusicGlyph,
  чтение: ReadingGlyph,
  паломничества: PilgrimageGlyph,
  ретриты: RetreatGlyph,
};

/**
 * `data-interest-icon` держит имя подобранной иконки: по нему проверяется,
 * что интересу досталась своя картинка, а не общая искра.
 */
export function UnionInterestIcon({ interest }: { interest: string }) {
  const key = interest.trim().toLowerCase();
  const Known = interestGlyphs[key];

  return (
    <span
      data-interest-icon={Known ? key : "spark"}
      className="inline-flex items-center"
    >
      {Known ? <Known /> : <SparkGlyph />}
    </span>
  );
}
