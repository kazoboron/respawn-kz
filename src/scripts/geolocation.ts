import { CITIES, type City } from '../data/cities';

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function findClosestCity(lat: number, lon: number): { city: City; distance: number } {
  let best: City = CITIES[0];
  let bestDist = Infinity;
  for (const c of CITIES) {
    const d = distanceKm(lat, lon, c.lat, c.lon);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return { city: best, distance: bestDist };
}

function setGeoStatus(text: string, state?: 'success' | 'error'): void {
  const el = document.getElementById('geo-status');
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
  el.className = 'geo-status' + (state ? ` geo-status--${state}` : '');
}

export function setupGeolocation(): void {
  const btn = document.getElementById('geo-btn') as HTMLButtonElement | null;
  const select = document.getElementById('city-select') as HTMLSelectElement | null;
  if (!btn || !select) return;

  btn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      setGeoStatus('Геолокация не поддерживается', 'error');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Определяем…';
    setGeoStatus('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const { city, distance } = findClosestCity(latitude, longitude);
        select.value = city.id;
        select.dispatchEvent(new Event('change'));
        const distText = distance < 1 ? 'вы внутри города' : `~${Math.round(distance)} км до центра`;
        setGeoStatus(`📍 ${city.label} · ${distText}`, 'success');
        btn.disabled = false;
        btn.textContent = '📍 Мой город';
      },
      (err) => {
        const messages: Record<number, string> = {
          1: 'Доступ к геолокации запрещён',
          2: 'Не удалось определить позицию',
          3: 'Превышено время ожидания',
        };
        setGeoStatus(messages[err.code] || 'Ошибка геолокации', 'error');
        btn.disabled = false;
        btn.textContent = '📍 Мой город';
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  });
}
