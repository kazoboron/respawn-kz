function SearchForm({ variant = 'hero', onSearch }) {
  const [city, setCity] = React.useState('');
  const [date, setDate] = React.useState('2026-05-17');
  const [time, setTime] = React.useState('20:00');
  const times = ['18:00','19:00','20:00','21:00','22:00','23:00'];

  return (
    <form
      className="search"
      onSubmit={(e) => { e.preventDefault(); onSearch?.({ city, date, time }); }}
    >
      <label className="field">
        <span className="field__label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Город
          <button type="button" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.05em', textTransform: 'none', color: 'var(--neon-cyan)', padding: '2px 8px', border: '1px solid rgba(0,240,255,.2)', borderRadius: 100, background: 'rgba(0,240,255,.06)' }}>
            📍 Мой город
          </button>
        </span>
        <select className="field__input" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Все города</option>
          {window.CITIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Дата</span>
        <input className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Время</span>
        <select className="field__input" value={time} onChange={(e) => setTime(e.target.value)}>
          {times.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <button className="btn btn--primary" type="submit" style={{ alignSelf: 'end', height: 46 }}>Найти клуб</button>
    </form>
  );
}
window.SearchForm = SearchForm;
