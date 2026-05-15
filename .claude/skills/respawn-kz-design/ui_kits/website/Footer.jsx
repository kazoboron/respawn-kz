function Footer({ navigate }) {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__col">
          <Logo size="md" />
          <p className="footer__desc" style={{ marginTop: 16 }}>
            Платформа онлайн-бронирования компьютерных клубов в Казахстане.
          </p>
          <p className="footer__copy">© 2026 respawn.kz</p>
        </div>
        <div className="footer__col">
          <h4 className="footer__title">Навигация</h4>
          <ul className="footer__list">
            <li><a onClick={() => navigate('catalog')} style={{ cursor: 'pointer' }}>Клубы</a></li>
            <li><a onClick={() => navigate('for-clubs')} style={{ cursor: 'pointer' }}>Для клубов</a></li>
            <li><a onClick={() => navigate('about')} style={{ cursor: 'pointer' }}>О нас</a></li>
          </ul>
          <h4 className="footer__title" style={{ marginTop: 20 }}>Правовая информация</h4>
          <ul className="footer__list">
            <li><a>Конфиденциальность</a></li>
            <li><a>Условия использования</a></li>
          </ul>
        </div>
        <div className="footer__col">
          <h4 className="footer__title">Контакты</h4>
          <ul className="footer__list">
            <li><a href="mailto:hello@respawn.kz">hello@respawn.kz</a></li>
            <li><a href="tel:+77001234567">+7 (700) 123-45-67</a></li>
          </ul>
          <div className="footer__social">
            <a className="footer__social-link" aria-label="Instagram">IG</a>
            <a className="footer__social-link" aria-label="Telegram">TG</a>
            <a className="footer__social-link" aria-label="TikTok">TT</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
window.Footer = Footer;
