import { useEffect } from 'react';
import { COMPANY } from '@/config/product';

export function usePageTitle(title?: string) {
  useEffect(() => {
    const base = `${COMPANY.name} ${COMPANY.productName}`;
    document.title = title ? `${title} · ${base}` : base;
  }, [title]);
}
