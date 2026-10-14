import { COMPANY, PRICE } from '@/config/product';
import { LegalLayout, Placeholder } from './LegalLayout';

export function RefundsPage() {
  return (
    <LegalLayout title="Refund policy" pageName="refund policy">
      <p>
        This policy explains when a payment of {PRICE.display} for an Idea Validator Report can be
        refunded. It forms part of the terms of service.
      </p>

      <h2>1. Before research starts</h2>
      <p>
        If you contact us at {COMPANY.supportEmail} before we begin researching your Report, we will
        cancel the order and refund you in full.{' '}
        <Placeholder>owner to define “before research starts”, for example within 2 hours of payment or until the status changes to Researching</Placeholder>
      </p>

      <h2>2. After research starts</h2>
      <p>
        Because the Report is produced for you and work begins promptly, refunds after research has
        started are{' '}
        <Placeholder>owner to choose: not available / available at our discretion / partial</Placeholder>.
      </p>

      <h2>3. If we cannot deliver</h2>
      <p>
        If we cannot produce a Report for your idea (for example because the idea falls outside our
        coverage, or we cannot find enough evidence to form a view), we will tell you and refund you
        in full.
      </p>

      <h2>4. If there is a problem with the Report</h2>
      <p>
        If the Report does not address the idea and market you submitted, or is missing a section
        described on the website, contact us within <Placeholder>X days</Placeholder> and we will
        correct it or refund you. A refund is not available simply because you disagree with the
        verdict.
      </p>

      <h2>5. Statutory rights</h2>
      <p>
        Nothing in this policy affects rights you have under consumer law in your country.{' '}
        <Placeholder>legal review: UK Consumer Contracts Regulations, US state law, Australian Consumer Law guarantees</Placeholder>
      </p>

      <h2>6. How refunds are paid</h2>
      <p>
        Refunds go back to the original payment method, usually within{' '}
        <Placeholder>X working days</Placeholder> of approval, through our payment provider.
      </p>

      <h2>7. Contact</h2>
      <p>
        {COMPANY.supportEmail} <Placeholder>replace with real address</Placeholder>
      </p>
    </LegalLayout>
  );
}
