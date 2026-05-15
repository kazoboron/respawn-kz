function Header({ route, navigate, user, onLogin }) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navItems = [
    { route: 'catalog', label: 'Клубы' },
    { route: 'how', label: 'Как это работает', anchor: 'how' },
    { route: 'benefits', label: 'Преимущества', anchor: 'benefits' },
    { route: 'for-clubs', label: 'Для клубов' },
    { route: 'about', label: 'О нас' },
  ];

  return (
    <header className={'header' + (scrolled ? ' scrolled' : '')}>
      <div className="container header__inner">
        <a onClick={() => navigate('landing')} style={{ cursor: 'pointer', display: 'inline-flex' }}>
          <Logo size="md" />
        </a>
        <nav className="nav">
          {navItems.map((it) => (
            <a
              key={it.label}
              className={'nav__link' + (route === it.route ? ' nav__link--active' : '')}
              onClick={() => {
                if (it.anchor) {
                  navigate('landing');
                  setTimeout(() => document.getElementById(it.anchor)?.scrollIntoView({ behavior: 'smooth' }), 100);
                } else {
                  navigate(it.route);
                }
              }}
            >
              {it.label}
            </a>
          ))}
        </nav>
        <div className="header__actions">
          {user ? (
            <a className="btn btn--ghost" onClick={() => navigate('me')} style={{ cursor: 'pointer' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{user.email.split('@')[0]}</span>
            </a>
          ) : (
            <a className="btn btn--ghost" onClick={() => navigate('login')} style={{ cursor: 'pointer' }}>Войти</a>
          )}
        </div>
      </div>
    </header>
  );
}

window.Header = Header;
