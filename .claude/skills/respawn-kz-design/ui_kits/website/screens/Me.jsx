function Me({ user, bookings, navigate, onCancel }) {
  return (
    <main className="me-page">
      <div className="container">
        <header className="me-page__header">
          <h1 className="me-page__title">Личный кабинет</h1>
          <p className="me-page__email">
            Вошёл как <strong>{user?.email || 'guest@respawn.kz'}</strong>
          </p>
        </header>

        <h2 className="club-section__title" style={{ fontSize: 20 }}>Мои бронирования</h2>

        {bookings.length === 0 ? (
          <div className="me-empty">
            <p style={{ marginBottom: 14 }}>Пока пусто. Забронируй первый клуб.</p>
            <button className="btn btn--primary" onClick={() => navigate('catalog')}>Найти клуб</button>
          </div>
        ) : (
          <div className="me-bookings__list">
            {bookings.map((b, i) => (
              <div className="me-booking" key={i}>
                <div className="me-booking__main">
                  <h3 className="me-booking__name">
                    <a onClick={() => navigate('club', b.club.slug)} style={{ cursor: 'pointer' }}>{b.club.name}</a>
                  </h3>
                  <div className="me-booking__meta">
                    <span>{window.CITY_LABELS[b.club.city]}</span>
                    <span className="club-card__meta-sep">·</span>
                    <span>{b.date}</span>
                    <span className="club-card__meta-sep">·</span>
                    <span>{b.time}</span>
                    <span className="club-card__meta-sep">·</span>
                    <span>{b.hours} ч</span>
                  </div>
                </div>
                <div className="me-booking__side">
                  <div className="me-booking__price">{window.formatPrice(b.total)} ₸</div>
                  <span className={'pill pill--' + b.status}>{b.status}</span>
                  {b.status !== 'cancelled' && (
                    <button className="btn btn--ghost btn--sm" onClick={() => onCancel(i)}>Отменить</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
window.Me = Me;
