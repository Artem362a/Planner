import { Link } from "react-router-dom";

function AboutIllustration() {
  return (
    <svg
      viewBox="0 0 520 360"
      className="about-illustration"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="aboutBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#b59cff" />
          <stop offset="100%" stopColor="#7f6ad8" />
        </linearGradient>

        <linearGradient id="card1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
          <stop offset="100%" stopColor="#f1ecff" stopOpacity="0.96" />
        </linearGradient>

        <linearGradient id="card2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8f4ff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#e7dcff" stopOpacity="0.95" />
        </linearGradient>

        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodOpacity="0.18" />
        </filter>
      </defs>

      <rect x="20" y="20" width="480" height="320" rx="28" fill="url(#aboutBg)" />

      <circle cx="420" cy="78" r="22" fill="#ffffff" fillOpacity="0.22" />
      <circle cx="110" cy="285" r="18" fill="#ffffff" fillOpacity="0.16" />
      <circle cx="455" cy="290" r="10" fill="#ffffff" fillOpacity="0.18" />

      <rect
        x="64"
        y="64"
        width="180"
        height="220"
        rx="24"
        fill="url(#card1)"
        filter="url(#softShadow)"
      />
      <rect
        x="210"
        y="100"
        width="220"
        height="150"
        rx="24"
        fill="url(#card2)"
        filter="url(#softShadow)"
      />

      <rect x="88" y="92" width="60" height="14" rx="7" fill="#8f79d9" fillOpacity="0.28" />
      <rect x="88" y="122" width="132" height="18" rx="9" fill="#8f79d9" fillOpacity="0.18" />
      <rect x="88" y="152" width="110" height="18" rx="9" fill="#8f79d9" fillOpacity="0.14" />

      <rect x="88" y="190" width="120" height="40" rx="14" fill="#ffffff" />
      <circle cx="108" cy="210" r="7" fill="#7ecf8a" />
      <rect x="122" y="202" width="64" height="8" rx="4" fill="#8f79d9" fillOpacity="0.25" />
      <rect x="122" y="214" width="44" height="7" rx="3.5" fill="#8f79d9" fillOpacity="0.15" />

      <rect x="234" y="124" width="98" height="16" rx="8" fill="#8f79d9" fillOpacity="0.22" />
      <rect x="234" y="156" width="170" height="18" rx="9" fill="#8f79d9" fillOpacity="0.12" />
      <rect x="234" y="186" width="145" height="18" rx="9" fill="#8f79d9" fillOpacity="0.12" />

      <rect x="236" y="218" width="164" height="12" rx="6" fill="#d9cffc" />
      <rect x="236" y="218" width="112" height="12" rx="6" fill="#7ecf8a" />

      <circle cx="390" cy="75" r="34" fill="#ffffff" fillOpacity="0.95" filter="url(#softShadow)" />
      <path
        d="M375 75h30M390 60v30"
        stroke="#8f79d9"
        strokeWidth="8"
        strokeLinecap="round"
      />

      <path
        d="M328 294c26-16 42-38 50-65"
        stroke="#ffffff"
        strokeOpacity="0.72"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M300 284c17 3 30 7 43 16"
        stroke="#ffffff"
        strokeOpacity="0.4"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function AboutPage() {
  return (
    <div className="app-wrapper">
      <div className="app">
        <header className="app-header">
          <div className="app-header-left">
            <Link to="/" className="back-link">
              ←
            </Link>
          </div>

          <div className="app-header-center">О НАС</div>

          <div className="app-header-right" />
        </header>

        <main className="day-page-main">
          <div className="day-big-card">
            <section className="about-page">
              <div className="about-hero">
                <div className="about-hero-text">
                  <div className="about-badge">Планирование без хаоса</div>

                  <h1 className="about-title">
                    Удобное пространство для дня, недели и целей
                  </h1>

                  <p className="about-subtitle">
                    Это приложение помогает собирать задачи в одном месте,
                    видеть картину дня и недели целиком и не теряться в мелочах.
                  </p>

                  <div className="about-actions">
                    <Link to="/" className="about-primary-link">
                      На главную
                    </Link>
                    <Link to="/day-plan" className="about-secondary-link">
                      Открыть план на день
                    </Link>
                  </div>
                </div>

                <div className="about-hero-art">
                  <AboutIllustration />
                </div>
              </div>

              <div className="about-grid">
                <article className="about-card">
                  <div className="about-card-icon">📅</div>
                  <h3>План на день</h3>
                  <p>
                    Удобное расписание, задачи по времени, категории и понятная
                    структура на каждый день.
                  </p>
                </article>

                <article className="about-card">
                  <div className="about-card-icon">🗓️</div>
                  <h3>План на неделю</h3>
                  <p>
                    Смотри на всю неделю сразу, распределяй нагрузку и держи в
                    голове общую картину.
                  </p>
                </article>

                <article className="about-card">
                  <div className="about-card-icon">🎯</div>
                  <h3>Цели и фокус</h3>
                  <p>
                    Не только список дел, но и понимание, ради чего всё это
                    делается.
                  </p>
                </article>
              </div>

              <section className="about-story">
                <div className="about-story-left">
                  <h2>Зачем это приложение</h2>
                  <p>
                    Иногда хочется, чтобы планирование было не перегруженным, а
                    спокойным и понятным. Без лишнего шума, без десятка разных
                    сервисов и без ощущения, что ты управляешь не своей жизнью,
                    а только таскаешь карточки по экрану.
                  </p>
                  <p>
                    Здесь всё собрано в одном месте: день, неделя, шаблоны,
                    категории и цели. Так легче держать порядок и не терять
                    важное.
                    Картинка, которую вы видите на сайте - это чат жбт нарисовал через программный код лол
                  </p>
                </div>

                <div className="about-story-right">
                  <div className="about-quote">
                    “Планирование должно помогать жить, а не усложнять её.”
                    АХАХАХА ЖИТЬ ЭТО КТО ТАКОЙ
                  </div>
                </div>
              </section>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AboutPage;