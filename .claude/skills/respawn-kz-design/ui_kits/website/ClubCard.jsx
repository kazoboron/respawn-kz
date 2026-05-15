function ClubCard({ club, onOpen, onBook }) {
  return (
    <article className="club-card">
      <div className="club-card__media" style={{ background: club.gradient, cursor: 'pointer' }} onClick={() => onOpen(club)}>
        <span className="club-card__initial">{club.initial}</span>
      </div>
      <div className="club-card__body">
        <div className="club-card__header">
          <h3 className="club-card__name">
            <a onClick={() => onOpen(club)} style={{ cursor: 'pointer' }}>{club.name}</a>
          </h3>
          <span className="pill pill--rating">★ {club.rating}</span>
        </div>
        <div className="club-card__meta">
          <span>{window.CITY_LABELS[club.city]}</span>
          <span className="club-card__meta-sep">·</span>
          <span>{club.district}</span>
          <span className="club-card__meta-sep">·</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{club.reviews} отзывов</span>
        </div>
        <div className="club-card__tags">
          {club.tags.map((t) => <span className="tag" key={t}>{t}</span>)}
        </div>
        <div className="club-card__footer">
          <div className="club-card__price">
            <span className="club-card__price-from">от</span>
            <span className="club-card__price-value">{window.formatPrice(club.price)} ₸</span>
            <span className="club-card__price-unit"> /час</span>
          </div>
          <button className="btn btn--primary btn--sm" onClick={() => onBook(club)}>Забронировать</button>
        </div>
      </div>
    </article>
  );
}
window.ClubCard = ClubCard;
