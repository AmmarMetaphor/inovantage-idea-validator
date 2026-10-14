import type { ReactNode } from 'react';
import { DraftBanner } from '@/components/DraftBanner';
import { usePageTitle } from '@/components/usePageTitle';

interface LegalLayoutProps {
  title: string;
  pageName: string;
  children: ReactNode;
}

export function LegalLayout({ title, pageName, children }: LegalLayoutProps) {
  usePageTitle(`${title} (draft)`);
  return (
    <div className="container container--narrow form-page page-enter">
      <div className="form-page__head">
        <span className="eyebrow">Draft for owner review</span>
        <h1>{title}</h1>
        <p>
          Last edited: <Placeholder>date</Placeholder>. Status: draft, not in force.
        </p>
      </div>
      <DraftBanner page={pageName} />
      <div className="prose" style={{ marginTop: 'var(--space-8)' }}>
        {children}
      </div>
    </div>
  );
}

export function Placeholder({ children }: { children: string }) {
  return (
    <mark
      style={{
        background: 'var(--color-warning-100)',
        color: 'var(--color-warning-700)',
        padding: '0 0.3rem',
        borderRadius: 'var(--radius-sm)',
        fontStyle: 'italic',
      }}
    >
      [{children}]
    </mark>
  );
}
