function Landing({ navigate, openClub, openBooking }) {
  const topClubs = window.CLUBS.slice(0, 6);
  const steps = [
    { num: '01', title: 'Выбери клуб', desc: 'Фильтруй по району, цене и оборудованию. Сравнивай рейтинги и отзывы.', icon: <Icons.Pin /> },
    { num: '02', title: 'Забронируй слот', desc: 'Выбери дату, время и количество часов. Оплачивай картой — Visa, Mastercard, Kaspi.', icon: <Icons.Calendar /> },
    { num: '03', title: 'Приходи и играй', desc: 'Покажи QR-код на ресепшене — твоё место уже готово. Без очередей и звонков.', icon: <Icons.Gamepad /> },
  ];
  const benefits = [
    { title: 'Онлайн-бронирование', desc: 'Не нужно звонить и держать место. Бронь подтверждается мгновенно.', icon: <Icons.Booking /> },
    { title: 'Оплата картой', desc: 'Visa, Mastercard, Kaspi. Без наличных и предоплаты администратору.', icon: <Icons.Card /> },
    { title: 'Проверенные клубы', desc: 'Все клубы прошли модерацию. Реальные отзывы, реальные рейтинги.', icon: <Icons.Shield /> },
    { title: 'Бонусная программа', desc: 'Кэшбек 5% часами за каждое посещение. Бонусы не сгорают.', icon: <Icons.Medal /> },
  ];

  return (
    <main>
      <section className="hero" id="hero">
        <div className="hero__grid" aria-hidden="true"></div>
        <div className="hero__scanline" aria-hidden="true"></div>
        <div className="container hero__inner">
          <h1 className="hero__title">
            Забронируй компьютерный клуб <br />
            в Казахстане за <span className="glitch" data-text="30 секунд">30 секунд</span>
          </h1>
          <p className="hero__subtitle">
            Лучшие клубы страны в одном месте. Выбирай слот, оплачивай онлайн, приходи играть.
          </p>
          <SearchForm variant="hero" onSearch={() => navigate('catalog')} />
          <div className="hero__stats">
            {[{v:'12 000+',l:'игроков'},{v:'80+',l:'клубов'},{v:'10',l:'городов'}].map(s => (
              <div className="stat" key={s.l}>
                <span className="stat__value">{s.v}</span>
                <span className="stat__label">{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="how" id="how">
        <div className="container">
          <h2 className="section__title">Три шага до игры</h2>
          <div className="how__steps">
            {steps.map(s => (
              <div className="step" key={s.num}>
                <div className="step__num">{s.num}</div>
                <div className="step__icon">{s.icon}</div>
                <h3 className="step__title">{s.title}</h3>
                <p className="step__desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="clubs" id="clubs">
        <div className="container">
          <h2 className="section__title">Топ клубы в Казахстане</h2>
          <p className="section__subtitle">Проверенные клубы с лучшим рейтингом</p>
          <div className="clubs__grid">
            {topClubs.map((c) => <ClubCard key={c.slug} club={c} onOpen={openClub} onBook={openBooking} />)}
          </div>
        </div>
      </section>

      <section className="benefits" id="benefits">
        <div className="container">
          <h2 className="section__title">Почему respawn.kz</h2>
          <div className="benefits__grid">
            {benefits.map(b => (
              <div className="benefit" key={b.title}>
                <div className="benefit__icon">{b.icon}</div>
                <div>
                  <h3 className="benefit__title">{b.title}</h3>
                  <p className="benefit__desc">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FAQ items={window.LANDING_FAQ} />

      <section className="cta" id="cta">
        <div className="container">
          <div className="cta__inner">
            <h2 className="cta__title">Готов играть?</h2>
            <p className="cta__subtitle">Найди свой клуб и забронируй слот прямо сейчас</p>
            <a className="btn btn--primary btn--large" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ position: 'relative', cursor: 'pointer' }}>
              Найти клуб
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
window.Landing = Landing;
