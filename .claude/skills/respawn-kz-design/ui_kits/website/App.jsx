function App() {
  const [route, setRoute] = React.useState('landing');
  const [activeClub, setActiveClub] = React.useState(null);
  const [bookingClub, setBookingClub] = React.useState(null);
  const [user, setUser] = React.useState(null);
  const [bookings, setBookings] = React.useState([]);
  const [toast, setToast] = React.useState(null);

  const navigate = (r, slug) => {
    setRoute(r);
    if (r === 'club' && slug) setActiveClub(window.CLUBS.find(c => c.slug === slug));
    window.scrollTo({ top: 0 });
  };
  const openClub = (club) => { setActiveClub(club); navigate('club'); };
  const openBooking = (club) => setBookingClub(club);

  const confirmBooking = (b) => {
    if (!user) {
      // Stash booking intent, then send to login
      setBookingClub(null);
      setToast('Войди, чтобы завершить бронирование');
      setTimeout(() => setToast(null), 2500);
      navigate('login');
      return;
    }
    setBookings(prev => [{ ...b, status: 'confirmed' }, ...prev]);
    setBookingClub(null);
    setToast(`✓ Бронь подтверждена — ${b.club.name}, ${b.date} ${b.time}`);
    setTimeout(() => setToast(null), 3500);
    navigate('me');
  };

  const onLogin = (email) => setUser({ email });

  return (
    <React.Fragment>
      <Header route={route} navigate={navigate} user={user} />
      {route === 'landing' && <Landing navigate={navigate} openClub={openClub} openBooking={openBooking} />}
      {route === 'catalog' && <Catalog navigate={navigate} openClub={openClub} openBooking={openBooking} />}
      {route === 'club' && <ClubDetail club={activeClub} navigate={navigate} openBooking={openBooking} />}
      {route === 'login' && <Login navigate={navigate} onLogin={onLogin} />}
      {route === 'me' && <Me user={user} bookings={bookings} navigate={navigate} onCancel={(i) => setBookings(prev => prev.map((b, idx) => idx === i ? { ...b, status: 'cancelled' } : b))} />}
      {route === 'for-clubs' && (
        <main className="auth-page" style={{ paddingTop: 140 }}>
          <div className="container" style={{ textAlign: 'center', maxWidth: 720 }}>
            <h1 className="page-hero__title">Для владельцев клубов</h1>
            <p className="page-hero__subtitle">Подключи свой клуб к respawn.kz — поток клиентов без вложений в маркетинг. Подключение бесплатное, комиссия только с реальных броней.</p>
            <a className="btn btn--primary btn--large" style={{ marginTop: 40, cursor: 'pointer' }} onClick={() => navigate('landing')}>Оставить заявку</a>
          </div>
        </main>
      )}
      {route === 'about' && (
        <main className="auth-page" style={{ paddingTop: 140 }}>
          <div className="container" style={{ maxWidth: 760, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <h1 className="page-hero__title" style={{ textAlign: 'left', marginBottom: 24 }}>О нас</h1>
            <p style={{ marginBottom: 14, fontSize: 17 }}>respawn.kz объединяет компьютерные клубы Казахстана в одну удобную платформу. Мы решаем две боли одновременно: игроки больше не звонят и не ждут в очереди, а владельцы клубов получают предсказуемый поток клиентов без расходов на маркетинг.</p>
            <p style={{ marginBottom: 14, fontSize: 17 }}>Платформа стартовала в 2026 году. Сейчас мы работаем в 10 крупнейших городах Казахстана — от Алматы до Атырау. Наша цель к концу года — 100+ клубов-партнёров и 50 000+ активных игроков.</p>
            <p style={{ fontSize: 17 }}>Мы делаем продукт от людей, которые сами выросли в компьютерных клубах. Уважение к игре, прозрачность к клубам, никаких скрытых комиссий.</p>
          </div>
        </main>
      )}

      <Footer navigate={navigate} />

      {bookingClub && (
        <BookingModal
          club={bookingClub}
          onClose={() => setBookingClub(null)}
          onConfirm={confirmBooking}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 300, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 20px', color: 'var(--text-primary)', fontSize: 14, boxShadow: 'var(--glow-cyan)', fontFamily: 'var(--font-mono)' }}>
          {toast}
        </div>
      )}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
