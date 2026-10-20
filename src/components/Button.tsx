import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'teal';
type Size = 'md' | 'lg';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  children: ReactNode;
  className?: string;
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { to?: undefined };
type LinkProps = CommonProps & { to: string; state?: unknown };

function classes({ variant = 'primary', size = 'md', full, className }: CommonProps) {
  return ['btn', `btn--${variant}`, `btn--${size}`, full ? 'btn--full' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, full, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={classes({ variant, size, full, className, children })} {...rest}>
      {children}
    </button>
  );
});

export function ButtonLink({ variant, size, full, className, children, to, state }: LinkProps) {
  return (
    <Link to={to} state={state} className={classes({ variant, size, full, className, children })}>
      {children}
    </Link>
  );
}
