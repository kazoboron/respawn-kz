function ClubDetail({ club, navigate, openBooking }) {
  if (!club) return null;
  return (
    <main className="club-page">
      <div className="container">
        <nav className="breadcrumb">
          <a onClick={() => navigate('landing')}>Главная</a>
          <span className="breadcrumb__sep">/</span>
          <a onClick={() => navigate('catalog')}>Клубы</a>
          <span className="breadcrumb__sep">/</span>
          <span className="breadcrumb__current">{club.name}</span>
        </nav>

        <header className="club-page__hero" style={{ marginBottom: 32 }}>
          <h1 className="club-page__name">{club.name}</h1>
          <div className="club-page__meta">
            <span className="pill pill--rating">★ {club.rating}</span>
            <span>·</span>
            <span>{window.CITY_LABELS[club.city]}</span>
            <span className="club-card__meta-sep">·</span>
            <span>{club.district}</span>
            <span className="club-card__meta-sep">·</span>
            <span style={{ color: 'var(--text-muted)' }}>{club.reviews} отзывов</span>
          </div>
          <div className="club-page__tags">
            {club.tags.map(t => <span className="tag" key={t}>{t}</span>)}
          </div>
        </header>

        <div className="club-page__gallery">
          {club.gg.map((g, i) => (
            <div className="gallery-item" style={{ background: g }} key={i}>
              <span className="gallery-item__num">{i + 1}/{club.gg.length}</span>
            </div>
          ))}
        </div>

        <div className="club-page__layout">
          <div className="club-page__main">
            <section>
              <h2 className="club-section__title">О клубе</h2>
              <p className="club-section__text">{club.description}</p>
            </section>

            <section>
              <h2 className="club-section__title">Оборудование</h2>
              <ul className="equipment-list">
                {club.equipment.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </section>

            <section>
              <h2 className="club-section__title">Контакты</h2>
              <div className="info-grid">
                <div>
                  <div className="info-label">Адрес</div>
                  <div className="info-value">{club.address}</div>
                </div>
                <div>
                  <div className="info-label">Телефон</div>
                  <div className="info-value"><a href={`tel:${club.phone}`}>{club.phone}</a></div>
                </div>
                <div>
                  <div className="info-label">Режим работы</div>
                  <div className="info-value">{club.hours}</div>
                </div>
              </div>
            </section>
          </div>

          <aside className="club-page__sidebar">
            <div className="pricing-card">
              <div className="pricing-card__amount">
                <span className="pricing-card__from">от</span>
                <span className="pricing-card__value">{window.formatPrice(club.price)}</span>
                <span className="pricing-card__unit">₸ /час</span>
              </div>
              <button className="btn btn--primary btn--large pricing-card__btn" onClick={() => openBooking(club)}>
                Забронировать
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-soft)', fontSize: 12, color: 'var(--text-muted)' }}>
                <span>Оплата</span>
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                  {['VISA','MC','KSP'].map(p => (
                    <span key={p} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, padding: '3px 6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 4, color: 'var(--text-secondary)', letterSpacing: '.05em' }}>{p}</span>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
window.ClubDetail = ClubDetail;
