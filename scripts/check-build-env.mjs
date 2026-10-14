/*
  Build guard: a production deploy must not ship with demo mode on.
  Netlify sets CONTEXT=production for the live site. Locally CONTEXT is unset,
  so `npm run build` keeps working for previews.
*/
const context = process.env.CONTEXT ?? 'dev';
const demo = process.env.VITE_DEMO_MODE !== 'false';
if (context === 'production' && demo) {
  console.error(
    '\n[build] Refusing to build the production site with demo mode enabled.\n' +
      '        Set VITE_DEMO_MODE=false in the Netlify production environment.\n' +
      '        Demo mode simulates checkout and reports and must never face paying customers.\n',
  );
  process.exit(1);
}
if (context === 'production' && (process.env.REPORT_GENERATOR ?? 'anthropic') !== 'anthropic') {
  console.error('\n[build] REPORT_GENERATOR must be "anthropic" in production.\n');
  process.exit(1);
}
console.log(`[build] context=${context} demo=${demo}`);
