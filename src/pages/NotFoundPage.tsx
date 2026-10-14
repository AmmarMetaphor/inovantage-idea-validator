import { Link } from 'react-router-dom';
import { usePageTitle } from '@/components/usePageTitle';

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <div className="container container--form form-page page-enter stack-lg">
      <div className="form-page__head">
        <span className="eyebrow">404</span>
        <h1>That page does not exist</h1>
        <p>Check the address, or head back to the start.</p>
      </div>
      <div className="cluster">
        <Link to="/" className="btn btn--primary btn--md">
          Back to home
        </Link>
        <Link to="/find-report" className="btn btn--secondary btn--md">
          Find my report
        </Link>
      </div>
    </div>
  );
}
