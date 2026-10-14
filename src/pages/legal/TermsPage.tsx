import { Link } from 'react-router-dom';
import { COMPANY, PRICE, TURNAROUND } from '@/config/product';
import { LegalLayout, Placeholder } from './LegalLayout';

export function TermsPage() {
  return (
    <LegalLayout title="Terms of service" pageName="terms of service">
      <p>
        These terms govern the purchase of an Idea Validator feasibility report (the “Report”) from{' '}
        {COMPANY.name} (<Placeholder>legal entity name, company number, registered address</Placeholder>
        ), referred to as “we” or “us”. By placing an order you agree to these terms.
      </p>

      <h2>1. What you are buying</h2>
      <ul>
        <li>
          One Report covering one business idea in one primary market (United Kingdom, United States
          or Australia), based on the answers you submit and desk research from public sources.
        </li>
        <li>
          The Report is delivered by email as a web link and a PDF to the address you confirm at
          checkout. No customer account is created.
        </li>
        <li>
          We aim to deliver {TURNAROUND.label}. This is a target, not a guarantee.{' '}
          <Placeholder>owner to confirm the delivery commitment and any remedy for delay</Placeholder>
        </li>
      </ul>

      <h2>2. Price and payment</h2>
      <ul>
        <li>
          The price is {PRICE.display} per Report, shown in GBP for all markets, payable in full
          before research begins.{' '}
          <Placeholder>confirm whether price includes VAT/GST and how overseas tax is handled</Placeholder>
        </li>
        <li>
          Payment is processed by a third-party payment provider. We do not store card details.{' '}
          <Placeholder>name the provider</Placeholder>
        </li>
      </ul>

      <h2>3. Nature of the Report</h2>
      <ul>
        <li>
          The Report is desk research and general guidance. It is <strong>not</strong> financial,
          legal, tax, accounting or investment advice, and it is not a substitute for professional
          advice specific to your circumstances.
        </li>
        <li>
          The Report relies on the accuracy of your answers and on public sources that may be
          incomplete, out of date or inconsistent. Where you mark a figure as unknown, we use
          researched or assumed figures and say so in the Report.
        </li>
        <li>
          We do not guarantee any outcome, including that a business will succeed, obtain funding or
          achieve any level of income.
        </li>
      </ul>

      <h2>4. Your responsibilities</h2>
      <ul>
        <li>Provide accurate and complete answers and a working email address.</li>
        <li>
          Do not submit information you do not have the right to share, including third parties’
          confidential information.
        </li>
        <li>Review the Report critically and seek professional advice before acting on it.</li>
      </ul>

      <h2>5. Changes and cancellation</h2>
      <p>
        Research begins promptly after payment. You cannot change your answers after payment. Your
        cancellation and refund rights are set out in the <Link to="/refunds">refund policy</Link>,
        which forms part of these terms.{' '}
        <Placeholder>owner to confirm the position on consumer cancellation rights in each market, including the UK 14-day rule for digital content and services</Placeholder>
      </p>

      <h2>6. Intellectual property and use</h2>
      <ul>
        <li>
          You may use, copy and share the Report for your own business purposes, including with
          advisers, partners and lenders.
        </li>
        <li>You may not resell the Report or present it as independent advice from a third party.</li>
        <li>We retain the right to reuse our methods, templates and anonymised learnings.</li>
      </ul>

      <h2>7. Liability</h2>
      <p>
        Nothing in these terms limits liability that cannot be limited by law. Subject to that, our
        total liability in connection with a Report is limited to the price you paid for it, and we
        are not liable for indirect or consequential loss, including loss of profit or business.{' '}
        <Placeholder>legal review required for each market</Placeholder>
      </p>

      <h2>8. Privacy</h2>
      <p>
        Our <Link to="/privacy">privacy policy</Link> explains what we collect and how it is used.
      </p>

      <h2>9. Governing law and disputes</h2>
      <p>
        <Placeholder>governing law and jurisdiction; owner and legal adviser to decide, considering customers in the UK, US and Australia</Placeholder>
      </p>

      <h2>10. Contact</h2>
      <p>
        {COMPANY.supportEmail}{' '}
        <Placeholder>replace with the real support address and postal address</Placeholder>
      </p>
    </LegalLayout>
  );
}
