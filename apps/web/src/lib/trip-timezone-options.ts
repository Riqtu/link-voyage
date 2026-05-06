/**
 * Часовые пояса для настроек поездки (IANA). Соответствует API: строка до 80 символов.
 * Неизвестное значение из БД показывается отдельным пунктом в форме.
 */

export type TripTimezoneOption = {
  group: string;
  value: string;
  label: string;
};

/** Порядок групп в выпадающем списке */
const GROUP_ORDER: string[] = [
  "Россия",
  "СНГ",
  "Европа",
  "Африка и Ближний Восток",
  "Азия",
  "Америка",
  "Океания и Тихий океан",
  "UTC",
];

const RAW: TripTimezoneOption[] = [
  // Россия
  { group: "Россия", value: "Europe/Kaliningrad", label: "Калининград" },
  { group: "Россия", value: "Europe/Moscow", label: "Москва" },
  { group: "Россия", value: "Europe/Samara", label: "Самара" },
  { group: "Россия", value: "Asia/Yekaterinburg", label: "Екатеринбург" },
  { group: "Россия", value: "Asia/Omsk", label: "Омск" },
  { group: "Россия", value: "Asia/Krasnoyarsk", label: "Красноярск" },
  { group: "Россия", value: "Asia/Irkutsk", label: "Иркутск" },
  { group: "Россия", value: "Asia/Chita", label: "Чита" },
  { group: "Россия", value: "Asia/Yakutsk", label: "Якутск" },
  { group: "Россия", value: "Asia/Vladivostok", label: "Владивосток" },
  { group: "Россия", value: "Asia/Magadan", label: "Магадан" },
  { group: "Россия", value: "Asia/Sakhalin", label: "Сахалин" },
  { group: "Россия", value: "Asia/Kamchatka", label: "Камчатка" },
  // СНГ
  { group: "СНГ", value: "Europe/Minsk", label: "Минск" },
  { group: "СНГ", value: "Europe/Kiev", label: "Киев" },
  { group: "СНГ", value: "Asia/Almaty", label: "Алматы" },
  { group: "СНГ", value: "Asia/Aqtobe", label: "Актобе (Казахстан)" },
  { group: "СНГ", value: "Asia/Tashkent", label: "Ташкент" },
  { group: "СНГ", value: "Asia/Baku", label: "Баку" },
  { group: "СНГ", value: "Asia/Yerevan", label: "Ереван" },
  { group: "СНГ", value: "Asia/Tbilisi", label: "Тбилиси" },
  { group: "СНГ", value: "Asia/Bishkek", label: "Бишкек" },
  // Европа
  { group: "Европа", value: "Europe/London", label: "Лондон" },
  { group: "Европа", value: "Europe/Dublin", label: "Дублин" },
  { group: "Европа", value: "Europe/Lisbon", label: "Лиссабон" },
  { group: "Европа", value: "Europe/Madrid", label: "Мадрид" },
  { group: "Европа", value: "Europe/Paris", label: "Париж" },
  { group: "Европа", value: "Europe/Berlin", label: "Берлин" },
  { group: "Европа", value: "Europe/Rome", label: "Рим" },
  { group: "Европа", value: "Europe/Amsterdam", label: "Амстердам" },
  { group: "Европа", value: "Europe/Brussels", label: "Брюссель" },
  { group: "Европа", value: "Europe/Vienna", label: "Вена" },
  { group: "Европа", value: "Europe/Warsaw", label: "Варшава" },
  { group: "Европа", value: "Europe/Prague", label: "Прага" },
  { group: "Европа", value: "Europe/Stockholm", label: "Стокгольм" },
  { group: "Европа", value: "Europe/Oslo", label: "Осло" },
  { group: "Европа", value: "Europe/Helsinki", label: "Хельсинки" },
  { group: "Европа", value: "Europe/Athens", label: "Афины" },
  { group: "Европа", value: "Europe/Bucharest", label: "Бухарест" },
  { group: "Европа", value: "Europe/Sofia", label: "София" },
  { group: "Европа", value: "Europe/Belgrade", label: "Белград" },
  { group: "Европа", value: "Europe/Istanbul", label: "Стамбул" },
  { group: "Европа", value: "Atlantic/Reykjavik", label: "Рейкьявик" },
  // Африка и Ближний Восток
  {
    group: "Африка и Ближний Восток",
    value: "Africa/Cairo",
    label: "Каир",
  },
  {
    group: "Африка и Ближний Восток",
    value: "Africa/Johannesburg",
    label: "Йоханнесбург",
  },
  {
    group: "Африка и Ближний Восток",
    value: "Asia/Dubai",
    label: "Дубай",
  },
  {
    group: "Африка и Ближний Восток",
    value: "Asia/Riyadh",
    label: "Эр-Рияд",
  },
  {
    group: "Африка и Ближний Восток",
    value: "Asia/Tehran",
    label: "Тегеран",
  },
  {
    group: "Африка и Ближний Восток",
    value: "Asia/Jerusalem",
    label: "Иерусалим",
  },
  {
    group: "Африка и Ближний Восток",
    value: "Asia/Qatar",
    label: "Катар",
  },
  // Азия
  { group: "Азия", value: "Asia/Karachi", label: "Карачи" },
  { group: "Азия", value: "Asia/Calcutta", label: "Индия (основная)" },
  { group: "Азия", value: "Asia/Dhaka", label: "Дакка" },
  { group: "Азия", value: "Asia/Bangkok", label: "Бангкок" },
  { group: "Азия", value: "Asia/Jakarta", label: "Джакарта" },
  { group: "Азия", value: "Asia/Singapore", label: "Сингапур" },
  { group: "Азия", value: "Asia/Kuala_Lumpur", label: "Куала-Лумпур" },
  { group: "Азия", value: "Asia/Hong_Kong", label: "Гонконг" },
  { group: "Азия", value: "Asia/Shanghai", label: "Шанхай" },
  { group: "Азия", value: "Asia/Taipei", label: "Тайбэй" },
  { group: "Азия", value: "Asia/Tokyo", label: "Токио" },
  { group: "Азия", value: "Asia/Seoul", label: "Сеул" },
  { group: "Азия", value: "Asia/Manila", label: "Манила" },
  { group: "Азия", value: "Asia/Saigon", label: "Хошимин" },
  // Америка
  { group: "Америка", value: "America/Halifax", label: "Галифакс" },
  { group: "Америка", value: "America/New_York", label: "Нью-Йорк" },
  { group: "Америка", value: "America/Chicago", label: "Чикаго" },
  { group: "Америка", value: "America/Denver", label: "Денвер" },
  { group: "Америка", value: "America/Phoenix", label: "Финикс" },
  { group: "Америка", value: "America/Los_Angeles", label: "Лос-Анджелес" },
  { group: "Америка", value: "America/Vancouver", label: "Ванкувер" },
  { group: "Америка", value: "America/Toronto", label: "Торонто" },
  { group: "Америка", value: "America/Mexico_City", label: "Мехико" },
  { group: "Америка", value: "America/Bogota", label: "Богота" },
  { group: "Америка", value: "America/Lima", label: "Лима" },
  { group: "Америка", value: "America/Santiago", label: "Сантьяго" },
  { group: "Америка", value: "America/Sao_Paulo", label: "Сан-Паулу" },
  { group: "Америка", value: "America/Buenos_Aires", label: "Буэнос-Айрес" },
  { group: "Америка", value: "America/Caracas", label: "Каракас" },
  // Океания
  {
    group: "Океания и Тихий океан",
    value: "Pacific/Honolulu",
    label: "Гонолулу",
  },
  {
    group: "Океания и Тихий океан",
    value: "Pacific/Auckland",
    label: "Окленд",
  },
  {
    group: "Океания и Тихий океан",
    value: "Australia/Sydney",
    label: "Сидней",
  },
  {
    group: "Океания и Тихий океан",
    value: "Australia/Melbourne",
    label: "Мельбурн",
  },
  {
    group: "Океания и Тихий океан",
    value: "Australia/Perth",
    label: "Перт",
  },
  { group: "UTC", value: "Etc/UTC", label: "UTC (всемирное время)" },
];

const VALUES = new Set(RAW.map((o) => o.value));

export const TRIP_TIMEZONE_OPTIONS: readonly TripTimezoneOption[] = RAW;

/** Группы в нужном порядке; неизвестные из данных — в конце. */
export function tripTimezoneGroupsInOrder(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of GROUP_ORDER) {
    if (RAW.some((o) => o.group === g)) {
      out.push(g);
      seen.add(g);
    }
  }
  for (const o of RAW) {
    if (!seen.has(o.group)) {
      out.push(o.group);
      seen.add(o.group);
    }
  }
  return out;
}

export function tripTimezoneOptionsForGroup(
  group: string,
): TripTimezoneOption[] {
  return RAW.filter((o) => o.group === group);
}

/** Варианты для селектора: сохранённое нестандартное значение — отдельная группа сверху. */
export function tripTimezoneSelectModel(currentValue: string): {
  extraGroup: TripTimezoneOption[] | null;
  groups: string[];
} {
  const trimmed = currentValue.trim();
  if (trimmed && !VALUES.has(trimmed)) {
    return {
      extraGroup: [
        {
          group: "Сохранённое значение",
          value: trimmed,
          label: `${trimmed} (из данных поездки)`,
        },
      ],
      groups: tripTimezoneGroupsInOrder(),
    };
  }
  return { extraGroup: null, groups: tripTimezoneGroupsInOrder() };
}
