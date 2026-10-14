import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

interface NoticeProps {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  role?: 'status' | 'alert' | 'note';
  className?: string;
}

export function Notice({ tone = 'info', title, children, role, className }: NoticeProps) {
  const ariaRole = role === 'note' ? undefined : role;
  return (
    <div className={`notice notice--${tone} ${className ?? ''}`} role={ariaRole}>
      {title && <p className="notice__title">{title}</p>}
      <div className="notice__body">{children}</div>
    </div>
  );
}
