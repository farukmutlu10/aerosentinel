export interface TimezoneOption {
  label: string;
  iana: string;
  group: string;
}

export const TIMEZONE_GROUPS: { group: string; zones: TimezoneOption[] }[] = [
  {
    group: "Europe",
    zones: [
      { label: "London", iana: "Europe/London", group: "Europe" },
      { label: "Paris", iana: "Europe/Paris", group: "Europe" },
      { label: "Berlin", iana: "Europe/Berlin", group: "Europe" },
      { label: "Rome", iana: "Europe/Rome", group: "Europe" },
      { label: "Madrid", iana: "Europe/Madrid", group: "Europe" },
      { label: "Amsterdam", iana: "Europe/Amsterdam", group: "Europe" },
      { label: "Zurich", iana: "Europe/Zurich", group: "Europe" },
      { label: "Vienna", iana: "Europe/Vienna", group: "Europe" },
      { label: "Stockholm", iana: "Europe/Stockholm", group: "Europe" },
      { label: "Oslo", iana: "Europe/Oslo", group: "Europe" },
      { label: "Copenhagen", iana: "Europe/Copenhagen", group: "Europe" },
      { label: "Warsaw", iana: "Europe/Warsaw", group: "Europe" },
      { label: "Athens", iana: "Europe/Athens", group: "Europe" },
      { label: "Istanbul", iana: "Europe/Istanbul", group: "Europe" },
      { label: "Moscow", iana: "Europe/Moscow", group: "Europe" },
      { label: "Helsinki", iana: "Europe/Helsinki", group: "Europe" },
      { label: "Lisbon", iana: "Europe/Lisbon", group: "Europe" },
      { label: "Dublin", iana: "Europe/Dublin", group: "Europe" },
      { label: "Prague", iana: "Europe/Prague", group: "Europe" },
      { label: "Budapest", iana: "Europe/Budapest", group: "Europe" },
      { label: "Bucharest", iana: "Europe/Bucharest", group: "Europe" },
      { label: "Brussels", iana: "Europe/Brussels", group: "Europe" },
    ],
  },
  {
    group: "Americas",
    zones: [
      { label: "New York", iana: "America/New_York", group: "Americas" },
      { label: "Chicago", iana: "America/Chicago", group: "Americas" },
      { label: "Denver", iana: "America/Denver", group: "Americas" },
      { label: "Los Angeles", iana: "America/Los_Angeles", group: "Americas" },
      { label: "San Francisco", iana: "America/Los_Angeles", group: "Americas" },
      { label: "Seattle", iana: "America/Los_Angeles", group: "Americas" },
      { label: "Toronto", iana: "America/Toronto", group: "Americas" },
      { label: "Vancouver", iana: "America/Vancouver", group: "Americas" },
      { label: "Mexico City", iana: "America/Mexico_City", group: "Americas" },
      { label: "São Paulo", iana: "America/Sao_Paulo", group: "Americas" },
      { label: "Buenos Aires", iana: "America/Argentina/Buenos_Aires", group: "Americas" },
      { label: "Lima", iana: "America/Lima", group: "Americas" },
      { label: "Bogotá", iana: "America/Bogota", group: "Americas" },
      { label: "Santiago", iana: "America/Santiago", group: "Americas" },
      { label: "Caracas", iana: "America/Caracas", group: "Americas" },
    ],
  },
  {
    group: "Asia",
    zones: [
      { label: "Dubai", iana: "Asia/Dubai", group: "Asia" },
      { label: "Riyadh", iana: "Asia/Riyadh", group: "Asia" },
      { label: "Doha", iana: "Asia/Qatar", group: "Asia" },
      { label: "Kuwait", iana: "Asia/Kuwait", group: "Asia" },
      { label: "Tehran", iana: "Asia/Tehran", group: "Asia" },
      { label: "Karachi", iana: "Asia/Karachi", group: "Asia" },
      { label: "Mumbai", iana: "Asia/Kolkata", group: "Asia" },
      { label: "Delhi", iana: "Asia/Kolkata", group: "Asia" },
      { label: "Dhaka", iana: "Asia/Dhaka", group: "Asia" },
      { label: "Bangkok", iana: "Asia/Bangkok", group: "Asia" },
      { label: "Jakarta", iana: "Asia/Jakarta", group: "Asia" },
      { label: "Singapore", iana: "Asia/Singapore", group: "Asia" },
      { label: "Kuala Lumpur", iana: "Asia/Kuala_Lumpur", group: "Asia" },
      { label: "Hong Kong", iana: "Asia/Hong_Kong", group: "Asia" },
      { label: "Shanghai", iana: "Asia/Shanghai", group: "Asia" },
      { label: "Taipei", iana: "Asia/Taipei", group: "Asia" },
      { label: "Tokyo", iana: "Asia/Tokyo", group: "Asia" },
      { label: "Seoul", iana: "Asia/Seoul", group: "Asia" },
      { label: "Manila", iana: "Asia/Manila", group: "Asia" },
      { label: "Ho Chi Minh", iana: "Asia/Ho_Chi_Minh", group: "Asia" },
    ],
  },
  {
    group: "Oceania",
    zones: [
      { label: "Sydney", iana: "Australia/Sydney", group: "Oceania" },
      { label: "Melbourne", iana: "Australia/Melbourne", group: "Oceania" },
      { label: "Brisbane", iana: "Australia/Brisbane", group: "Oceania" },
      { label: "Perth", iana: "Australia/Perth", group: "Oceania" },
      { label: "Adelaide", iana: "Australia/Adelaide", group: "Oceania" },
      { label: "Auckland", iana: "Pacific/Auckland", group: "Oceania" },
      { label: "Fiji", iana: "Pacific/Fiji", group: "Oceania" },
    ],
  },
  {
    group: "Africa",
    zones: [
      { label: "Cairo", iana: "Africa/Cairo", group: "Africa" },
      { label: "Johannesburg", iana: "Africa/Johannesburg", group: "Africa" },
      { label: "Lagos", iana: "Africa/Lagos", group: "Africa" },
      { label: "Nairobi", iana: "Africa/Nairobi", group: "Africa" },
      { label: "Casablanca", iana: "Africa/Casablanca", group: "Africa" },
      { label: "Accra", iana: "Africa/Accra", group: "Africa" },
      { label: "Addis Ababa", iana: "Africa/Addis_Ababa", group: "Africa" },
      { label: "Tunis", iana: "Africa/Tunis", group: "Africa" },
      { label: "Algiers", iana: "Africa/Algiers", group: "Africa" },
    ],
  },
];

export const ALL_TIMEZONES: TimezoneOption[] = TIMEZONE_GROUPS.flatMap((g) => g.zones);

export const DEFAULT_TIMEZONE = "Europe/Istanbul";

export function getTimezoneLabel(iana: string): string {
  const tz = ALL_TIMEZONES.find((z) => z.iana === iana);
  return tz ? tz.label : iana;
}

export function getTimezoneOffset(iana: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: iana,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === "timeZoneName");
    return offsetPart ? offsetPart.value : "";
  } catch {
    return "";
  }
}
