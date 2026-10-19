import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { COMPANY, PRICE } from '@/config/product';
import { DEMO_MODE } from '@/config/runtime';

function Wordmark() {
  return (
    <Link to="/" className="wordmark" aria-label={`${COMPANY.name} ${COMPANY.productName} home`}>
      <span className="wordmark__name">{COMPANY.name}</span>
      <span className="wordmark__product">{COMPANY.productName}</span>
    </Link>
  );
}

const NAV = [
  { to: '/#how-it-works', label: 'How it works' },
  { to: '/sample-report', label: 'Sample report' },
  { to: '/#pricing', label: 'Pricing' },
  { to: '/find-report', label: 'Find my report' },
];

function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location]);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Wordmark />
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {open ? (
              <>
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </>
            ) : (
              <>
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </>
            )}
          </svg>
          <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
        </button>
        <nav id="site-nav" className={`site-nav ${open ? 'site-nav--open' : ''}`} aria-label="Primary">
          <ul className="site-nav__list">
            {NAV.map((item) => (
              <li key={item.to}>
                {item.to.includes('#') ? (
                  <Link to={item.to} className="site-nav__link">
                    {item.label}
                  </Link>
                ) : (
                  <NavLink to={item.to} className="site-nav__link">
                    {item.label}
                  </NavLink>
                )}
              </li>
            ))}
            <li className="site-nav__cta">
              <Link to="/validate" className="btn btn--primary btn--md">
                Explore my idea · {PRICE.display}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <Wordmark />
          <p className="small muted">
            Evidence-based idea validation reports for business ideas in the UK, US and Australia. From {PRICE.display}, one-time.
          </p>
          <p className="small muted">
            Reports are research and general guidance, not financial, legal, tax or investment advice.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="site-footer__links">
            <li>
              <Link to="/sample-report">Sample report</Link>
            </li>
            <li>
              <Link to="/find-report">Find my report</Link>
            </li>
            <li>
              <Link to="/terms">Terms (draft)</Link>
            </li>
            <li>
              <Link to="/privacy">Privacy (draft)</Link>
            </li>
            <li>
              <Link to="/refunds">Refunds (draft)</Link>
            </li>
          </ul>
        </nav>
        <p className="site-footer__legal small muted">
          © {year} {COMPANY.name}. Pre-launch site. Brand colours are provisional.
        </p>
      </div>
    </footer>
  );
}

function DemoBar() {
  if (!DEMO_MODE) return null;
  return (
    <div className="demo-bar" role="status">
      <div className="container">
        <strong>Demo mode.</strong> Checkout and report processing are simulated in your browser. No
        payment is taken and no report is produced.
      </div>
    </div>
  );
}

/** Scroll to top on route change, unless navigating to an in-page anchor. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
}

export function Layout({ children }: { children?: ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <ScrollManager />
      <DemoBar />
      <Header />
      <main id="main" className="site-main" tabIndex={-1}>
        {children ?? <Outlet />}
      </main>
      <Footer />
    </>
  );
}
