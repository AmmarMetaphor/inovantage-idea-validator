import { DEMO_MODE } from '@/config/product';

/** Small inline pill marking simulated behaviour. Renders nothing outside demo mode. */
export function DemoBadge({ label = 'Demo mode' }: { label?: string }) {
  if (!DEMO_MODE) return null;
  return <span className="demo-badge">{label}</span>;
}
