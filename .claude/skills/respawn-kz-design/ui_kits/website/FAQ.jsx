function FAQ({ items }) {
  return (
    <section className="faq" id="faq" style={{ padding: '96px 0' }}>
      <div className="container">
        <h2 className="section__title">Вопросы и ответы</h2>
        <div className="faq__list">
          {items.map((it, i) => (
            <details className="faq__item" key={i} open={i === 0}>
              <summary className="faq__question">
                {it.q}
                <span className="faq__icon">+</span>
              </summary>
              <p className="faq__answer">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
window.FAQ = FAQ;

function BookingModal({ club, onClose, onConfirm }) {
  const [hours, setHours] = React.useState(2);
  const [date, setDate] = React.useState('2026-05-17');
  const [time, setTime] = React.useState('20:00');
  const total = club.price * hours;

  return (
    <div className="modal-root" onClick={onClose}>
      <div className="modal__backdrop"></div>
      <div className="modal__panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label="Закрыть">✕</button>
        <h3 className="modal__title">Забронировать {club.name}</h3>
        <div className="modal__body">
          <form className="booking-form" onSubmit={(e) => { e.preventDefault(); onConfirm({ club, date, time, hours, total }); }}>
            <div className="booking-form__row">
              <label className="field">
                <span className="field__label">Дата</span>
                <input className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">Время</span>
                <select className="field__input" value={time} onChange={(e) => setTime(e.target.value)}>
                  {['18:00','19:00','20:00','21:00','22:00','23:00'].map(t => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Часов</span>
                <input className="field__input" type="number" min="1" max="12" value={hours} onChange={(e) => setHours(+e.target.value || 1)} />
              </label>
            </div>
            <p className="booking-form__total">
              Итого: <strong>{window.formatPrice(total)} ₸</strong>
            </p>
            <button className="btn btn--primary btn--large" type="submit" style={{ width: '100%' }}>
              Оплатить картой
            </button>
            <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              Visa · Mastercard · Kaspi · возврат на ту же карту 3-5 дней
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
window.BookingModal = BookingModal;
