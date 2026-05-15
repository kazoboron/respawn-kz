function Catalog({ navigate, openClub, openBooking }) {
  const [city, setCity] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [tags, setTags] = React.useState([]);

  const allTags = ['PC', 'PS5', 'VR', 'Sim Racing'];
  const filtered = window.CLUBS.filter(c => {
    if (city && c.city !== city) return false;
    if (query && !c.name.toLowerCase().includes(query.toLowerCase()) && !c.district.toLowerCase().includes(query.toLowerCase())) return false;
    if (tags.length && !tags.every(t => c.tags.includes(t))) return false;
    return true;
  });

  const toggleTag = (t) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  return (
    <main className="catalog">
      <div className="container">
        <nav className="breadcrumb">
          <a onClick={() => navigate('landing')}>Главная</a>
          <span className="breadcrumb__sep">/</span>
          <span className="breadcrumb__current">Клубы</span>
        </nav>

        <header className="catalog__header">
          <h1 className="catalog__title">Компьютерные клубы Казахстана</h1>
          <p className="catalog__subtitle">
            Найдено <strong>{filtered.length}</strong> {filtered.length === 1 ? 'клуб' : 'клубов'} · фильтруй и сравнивай
          </p>
        </header>

        <div className="catalog__filters">
          <label className="filter">
            <span className="filter__label">Город</span>
            <select className="filter__input" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Все</option>
              {window.CITIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="filter">
            <span className="filter__label">Поиск</span>
            <input className="filter__input" placeholder="Название или район..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="filter">
            <span className="filter__label">Оборудование</span>
            <div className="filter__tags">
              {allTags.map(t => (
                <span key={t} className={'chip' + (tags.includes(t) ? ' is-active' : '')} onClick={() => toggleTag(t)}>{t}</span>
              ))}
            </div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={() => { setCity(''); setQuery(''); setTags([]); }}>
            Сбросить
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="me-empty">
            По заданным фильтрам клубов не нашлось. Попробуй сбросить и расширить поиск.
          </div>
        ) : (
          <div className="clubs__grid">
            {filtered.map(c => <ClubCard key={c.slug} club={c} onOpen={openClub} onBook={openBooking} />)}
          </div>
        )}
      </div>
    </main>
  );
}
window.Catalog = Catalog;
