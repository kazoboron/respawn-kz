function Login({ navigate, onLogin }) {
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);

  return (
    <main className="auth-page">
      <div className="container">
        <div className="auth-card">
          <h1 className="auth-card__title">Войти</h1>
          <p className="auth-card__subtitle">Введи email — мы отправим ссылку. Кликнешь — войдёшь. Без пароля.</p>

          <div className="demo-banner">
            ⚙️ <strong>Demo-режим</strong>: данные сохраняются локально. Любой email подойдёт, письмо не отправляется.
          </div>

          {!sent ? (
            <form className="auth-form" onSubmit={(e) => {
              e.preventDefault();
              if (!email) return;
              setSent(true);
              setTimeout(() => { onLogin(email); navigate('me'); }, 1100);
            }}>
              <label className="auth-field">
                <span className="auth-label">Email</span>
                <input className="auth-input" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              <button className="btn btn--primary btn--large" type="submit" style={{ marginTop: 8 }}>Получить ссылку</button>
            </form>
          ) : (
            <div className="auth-success">
              <p>📨 Письмо отправлено на <strong>{email}</strong></p>
              <p style={{ marginTop: 8 }}>Проверь почту (включая спам) — кликни по ссылке.</p>
              <p style={{ marginTop: 8, color: 'var(--neon-yellow)' }}>Demo: автоматический вход через 1 сек…</p>
            </div>
          )}

          <p className="auth-footnote">Регистрация автоматическая — если входишь впервые, аккаунт создастся.</p>
        </div>
      </div>
    </main>
  );
}
window.Login = Login;
