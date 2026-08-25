import type {
  UnionChildrenStatus,
  UnionDiet,
  UnionEducationLevel,
  UnionHousing,
  UnionIncomeLevel,
  UnionProfileFieldKey,
  UnionRegulativePrinciple,
  UnionSpiritualEducation,
} from "@vedamatch/shared";

export interface UnionTagOption {
  value: string;
  label: string;
  category?: string;
}

export interface UnionSkillCategory {
  title: string;
  options: UnionTagOption[];
}

const tag = (label: string, category?: string): UnionTagOption => ({
  value: label,
  label,
  category,
});

export const unionLanguageOptions: UnionTagOption[] = [
  tag("русский"),
  tag("английский"),
  tag("украинский"),
  tag("испанский"),
  tag("немецкий"),
  tag("французский"),
  tag("хинди"),
  tag("бенгали"),
  tag("санскрит"),
  tag("другое"),
];

export const unionSkillCategories: UnionSkillCategory[] = [
  {
    title: "IT / цифровые",
    options: [
      tag("программирование", "IT / цифровые"),
      tag("дизайн", "IT / цифровые"),
      tag("маркетинг", "IT / цифровые"),
      tag("SMM", "IT / цифровые"),
      tag("видео / монтаж", "IT / цифровые"),
      tag("копирайтинг", "IT / цифровые"),
      tag("управление проектами", "IT / цифровые"),
    ],
  },
  {
    title: "Образование",
    options: [
      tag("преподавание", "Образование"),
      tag("наставничество", "Образование"),
      tag("организация курсов", "Образование"),
      tag("переводы", "Образование"),
    ],
  },
  {
    title: "Служение / проекты",
    options: [
      tag("организация мероприятий", "Служение / проекты"),
      tag("волонтёрство", "Служение / проекты"),
      tag("кухня / прасад", "Служение / проекты"),
      tag("музыка / киртан", "Служение / проекты"),
      tag("администрирование", "Служение / проекты"),
      tag("фандрайзинг", "Служение / проекты"),
    ],
  },
  {
    title: "Быт / ремесло",
    options: [
      tag("строительство", "Быт / ремесло"),
      tag("ремонт", "Быт / ремесло"),
      tag("кулинария", "Быт / ремесло"),
      tag("сад / ферма", "Быт / ремесло"),
      tag("медицина / здоровье", "Быт / ремесло"),
    ],
  },
];

export const unionSkillOptions: UnionTagOption[] = unionSkillCategories.flatMap(
  (category) => category.options,
);

export const unionInterestOptions: UnionTagOption[] = [
  tag("философия"),
  tag("йога"),
  tag("медитация"),
  tag("киртан"),
  tag("ведическая культура"),
  tag("здоровый образ жизни"),
  tag("путешествия"),
  tag("семья"),
  tag("служение"),
  tag("бизнес"),
  tag("образование"),
  tag("психология"),
  tag("аюрведа"),
  tag("экология"),
  tag("творчество"),
  tag("музыка"),
  tag("чтение"),
  tag("паломничества"),
  tag("ретриты"),
];

export const unionValueOptions: UnionTagOption[] = [
  tag("духовное развитие"),
  tag("честность"),
  tag("служение"),
  tag("семья"),
  tag("верность"),
  tag("простота"),
  tag("ответственность"),
  tag("доброта"),
  tag("чистота"),
  tag("уважение"),
  tag("совместная практика"),
  tag("община"),
  tag("осознанность"),
  tag("забота о людях"),
  tag("развитие проектов"),
];

export const unionDietLabels: Record<UnionDiet, string> = {
  vegetarian: "вегетарианство",
  vegan: "веганство",
  prasadam_only: "только прасад",
  transitioning: "перехожу на вегетарианство",
  not_vegetarian: "не вегетарианец",
};

export const unionRegulativePrincipleLabels: Record<
  UnionRegulativePrinciple,
  string
> = {
  no_meat: "не ем мясо, рыбу и яйца",
  no_intoxicants: "не употребляю интоксикации",
  no_gambling: "не играю в азартные игры",
  no_illicit_sex: "следую целомудрию",
};

export const unionChildrenStatusLabels: Record<UnionChildrenStatus, string> = {
  none_want: "нет, хочу",
  none_not_want: "нет, не хочу",
  none_undecided: "нет, пока не решил(а)",
  have_living_with: "есть, живут со мной",
  have_living_apart: "есть, живут отдельно",
};

export const unionEducationLabels: Record<UnionEducationLevel, string> = {
  school: "среднее",
  vocational: "среднее специальное",
  incomplete_higher: "неоконченное высшее",
  higher: "высшее",
  academic_degree: "учёная степень",
};

export const unionSpiritualEducationLabels: Record<
  UnionSpiritualEducation,
  string
> = {
  none: "пока не учился(ась)",
  temple_courses: "курсы при храме / бхакти-врикша",
  bhakti_shastri: "Бхакти-шастри",
  bhakti_vaibhava: "Бхакти-вайбхава",
  bhakti_vedanta: "Бхакти-веданта",
  other: "другое",
};

export const unionHousingLabels: Record<UnionHousing, string> = {
  own_place: "своё жильё",
  rent: "снимаю",
  with_parents: "с родителями",
  with_relatives: "с родственниками",
  community: "в общине преданных",
  temple_ashram: "при храме / в ашраме",
};

export const unionIncomeLabels: Record<UnionIncomeLevel, string> = {
  basic_needs_hard: "на основное не всегда хватает",
  basic_needs: "хватает на основное",
  basic_and_rest: "хватает на основное и отдых",
  comfortable: "могу позволить многое",
  prefer_not_say: "предпочитаю не указывать",
};

export const unionPetOptions: UnionTagOption[] = [
  tag("кошка"),
  tag("собака"),
  tag("корова"),
  tag("птицы"),
  tag("другие питомцы"),
  tag("нет питомцев"),
  tag("хочу завести"),
];

/** Подписи полей анкеты для прогресса заполнения и списка «Указать». */
export const unionProfileFieldLabels: Record<UnionProfileFieldKey, string> = {
  photos: "Фото",
  about: "О себе",
  status: "Статус",
  intentions: "Цель знакомства",
  languages: "Знание языков",
  interests: "Интересы",
  values: "Ценности",
  skills: "Навыки",
  familyStatus: "Семейный статус",
  childrenStatus: "Дети",
  diet: "Питание",
  regulativePrinciples: "Регулирующие принципы",
  ageRange: "Желаемый возраст партнёра",
  heightCm: "Рост",
  education: "Образование",
  spiritualEducation: "Духовное образование",
  housing: "Жилищные условия",
  income: "Материальная обеспеченность",
  pets: "Домашние животные",
};

export const unionFamilyStatusOptions = [
  { value: "", label: "не указан" },
  { value: "свободен / свободна", label: "свободен / свободна" },
  { value: "в отношениях", label: "в отношениях" },
  { value: "женат / замужем", label: "женат / замужем" },
  { value: "разведен / разведена", label: "разведен / разведена" },
  { value: "вдовец / вдова", label: "вдовец / вдова" },
  { value: "монах / монахиня", label: "монах / монахиня" },
  {
    value: "предпочитаю не указывать",
    label: "предпочитаю не указывать",
  },
];
