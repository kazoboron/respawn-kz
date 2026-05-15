export interface City {
  id: string;
  label: string;
  lat: number;
  lon: number;
}

export const CITIES: City[] = [
  { id: 'almaty',    label: 'Алматы',           lat: 43.2389, lon: 76.8897 },
  { id: 'astana',    label: 'Астана',           lat: 51.1605, lon: 71.4704 },
  { id: 'shymkent',  label: 'Шымкент',          lat: 42.3417, lon: 69.5901 },
  { id: 'karaganda', label: 'Караганда',        lat: 49.8047, lon: 73.1094 },
  { id: 'aktobe',    label: 'Актобе',           lat: 50.2839, lon: 57.1670 },
  { id: 'taraz',     label: 'Тараз',            lat: 42.9000, lon: 71.3667 },
  { id: 'pavlodar',  label: 'Павлодар',         lat: 52.2873, lon: 76.9670 },
  { id: 'oskemen',   label: 'Усть-Каменогорск', lat: 49.9468, lon: 82.6075 },
  { id: 'semey',     label: 'Семей',            lat: 50.4111, lon: 80.2275 },
  { id: 'atyrau',    label: 'Атырау',           lat: 47.1167, lon: 51.8833 },
];

export const CITY_LABELS: Record<string, string> = Object.fromEntries(
  CITIES.map((c) => [c.id, c.label])
);
