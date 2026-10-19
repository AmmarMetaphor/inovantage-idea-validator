/*
  Email templates. Plain text first, simple HTML second. Links carry the
  access token in the path; the pages they open are no-referrer/no-index.
  No delivery-time promises: progress is shown on the report page.
*/
import { COMPANY, CONSULTATION, DELIVERY_COPY, PRODUCTS } from '../../src/config/product';

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function consultationHtml(reportRef: string) {
  const [before, after] = CONSULTATION.text.split(CONSULTATION.email);
  return `<p style="font-size:13px;line-height:1.5;color:#0b1a2e;border-top:1px solid #d5deea;padding-top:16px;margin-top:28px">${esc(before)}<a href="${esc(CONSULTATION.mailto(reportRef))}">${esc(CONSULTATION.email)}</a>${esc(after ?? '')}</p>`;
}

function consultationText(reportRef: string) {
  return `${CONSULTATION.text}\nEmail: ${CONSULTATION.mailto(reportRef)}`;
}

function wrap(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#fcfbf8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b1a2e">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-family:Georgia,serif;font-size:22px;margin:0 0 4px">${COMPANY.name}</p>
<p style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#4a6a95;margin:0 0 24px">${COMPANY.productName}</p>
<h1 style="font-family:Georgia,serif;font-weight:500;font-size:22px;margin:0 0 16px">${esc(title)}</h1>
${bodyHtml}
<p style="font-size:12px;color:#4a6a95;margin-top:24px">Reports are desk research and general guidance, not financial, legal, tax or investment advice. This email was sent because a report was ordered with this address.</p>
</div></body></html>`;
}

function button(href: string, label: string) {
  return `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;background:#0f2440;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${esc(label)}</a></p>`;
}

export function confirmationEmail(input: { statusUrl: string; orderRef: string; ideaName: string; product: 'standard' | 'upgrade' }) {
  const prod = PRODUCTS[input.product];
  const subject = `Order confirmed: your ${prod.shortName.toLowerCase()} is underway (${input.orderRef})`;
  const text = `Thank you. We have received your payment of ${prod.display} for the ${prod.name} on "${input.ideaName}" and started work.

${DELIVERY_COPY.long}

Follow progress here (private to you, no account needed):
${input.statusUrl}

Order reference: ${input.orderRef}.

${COMPANY.name} ${COMPANY.productName}`;
  const html = wrap('Your order is confirmed', `
<p>Thank you. We have received your payment of <strong>${esc(prod.display)}</strong> for the <strong>${esc(prod.name)}</strong> on <strong>${esc(input.ideaName)}</strong> and started work.</p>
<p>${esc(DELIVERY_COPY.long)}</p>
${button(input.statusUrl, 'Follow progress')}
<p style="font-size:13px;color:#4a6a95">This link is private to you and does not expire. Order reference ${esc(input.orderRef)}.</p>`);
  return { subject, text, html };
}

export function reportReadyEmail(input: { statusUrl: string; orderRef: string; ideaName: string; verdict: string; tier: 'standard' | 'detailed' }) {
  const name = input.tier === 'detailed' ? PRODUCTS.upgrade.name : PRODUCTS.standard.name;
  const subject = `${name} ready: ${input.ideaName}`;
  const text = `Your ${name.toLowerCase()} for "${input.ideaName}" is ready. The PDF is attached.

${input.tier === 'standard' ? `Assessment: ${input.verdict}. Your readiness score, scorecards and radar are on the report page and in the PDF.` : 'It builds on your standard report with the detailed sections you ordered.'}

Open the interactive web report, download the PDF again any time, ${input.tier === 'standard' ? 'and see the detailed upgrade option, ' : ''}here (private link, no account needed):
${input.statusUrl}

Order reference: ${input.orderRef}.

${consultationText(input.orderRef)}

${COMPANY.name} ${COMPANY.productName}`;
  const html = wrap('Your report is ready', `
<p>Your <strong>${esc(name)}</strong> for <strong>${esc(input.ideaName)}</strong> is ready. The PDF is attached to this email.</p>
${input.tier === 'standard' ? `<p style="background:#eaf0f7;padding:12px 16px;border-radius:8px"><span style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#4a6a95">Assessment</span><br><strong style="font-family:Georgia,serif;font-size:18px">${esc(input.verdict)}</strong></p>` : ''}
${button(input.statusUrl, 'Open web report and PDF')}
<p style="font-size:13px;color:#4a6a95">The link is private to you, does not expire, and lets you download the PDF again whenever you need it. Order reference ${esc(input.orderRef)}.</p>
${consultationHtml(input.orderRef)}`);
  return { subject, text, html };
}

export function recoveryEmail(input: { links: { statusUrl: string; ideaName: string; orderRef: string }[] }) {
  const subject = `Your ${COMPANY.productName} report link${input.links.length > 1 ? 's' : ''}`;
  const list = input.links.map((l) => `- ${l.ideaName} (${l.orderRef}): ${l.statusUrl}`).join('\n');
  const text = `Someone asked us to re-send the report link for this email address. Here ${input.links.length > 1 ? 'are your reports' : 'is your report'}:

${list}

These links are private to you. If you did not request this, you can ignore this email; nothing has changed.

${COMPANY.name} ${COMPANY.productName}`;
  const html = wrap('Your report link', `
<p>Someone asked us to re-send the report link for this email address.</p>
${input.links.map((l) => `<p><strong>${esc(l.ideaName)}</strong> <span style="color:#4a6a95">(${esc(l.orderRef)})</span>${button(l.statusUrl, 'Open report page')}</p>`).join('')}
<p style="font-size:13px;color:#4a6a95">These links are private to you. If you did not request this, ignore this email; nothing has changed.</p>`);
  return { subject, text, html };
}

export function ownerAlertEmail(input: { orderRef: string; jobId: string; error: string }) {
  const subject = `[Idea Validator] Job dead for order ${input.orderRef}`;
  const text = `A report job exhausted its retries.\n\nOrder: ${input.orderRef}\nJob: ${input.jobId}\nLast error: ${input.error}\n\nInspect the jobs table and re-queue manually once fixed.`;
  return { subject, text, html: `<pre style="font-family:monospace">${esc(text)}</pre>` };
}
