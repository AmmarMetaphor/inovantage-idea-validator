import { COMPANY } from '@/config/product';
import { LegalLayout, Placeholder } from './LegalLayout';

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy" pageName="privacy policy">
      <p>
        This policy explains what personal information {COMPANY.name} (
        <Placeholder>legal entity, registered address, data protection contact</Placeholder>) collects
        when you use the Idea Validator, why, and what rights you have.
      </p>

      <h2>1. What we collect</h2>
      <table>
        <thead>
          <tr>
            <th>Information</th>
            <th>When</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Questionnaire answers, including financial estimates and personal circumstances</td>
            <td>When you submit the questionnaire and pay</td>
            <td>To research and write your Report</td>
          </tr>
          <tr>
            <td>Email address</td>
            <td>At submission</td>
            <td>To deliver the Report, confirm payment and re-send links on request</td>
          </tr>
          <tr>
            <td>Payment confirmation (not card details)</td>
            <td>From the payment provider after checkout</td>
            <td>To confirm your order and handle refunds</td>
          </tr>
          <tr>
            <td>Basic technical data (IP address, browser type, pages viewed)</td>
            <td>While you use the site</td>
            <td>Security, error diagnosis and service operation</td>
          </tr>
        </tbody>
      </table>
      <p>
        <Placeholder>owner to confirm whether any analytics, advertising or session-recording tools will be used; none are included in this frontend build</Placeholder>
      </p>

      <h2>2. What happens in your browser</h2>
      <ul>
        <li>
          Questionnaire answers are held in your browser’s memory until you submit them. They are not
          saved to your device by default. If session persistence is enabled, answers are kept in
          this tab only and cleared when the tab closes.
        </li>
        <li>
          After payment, the site keeps a small reference (order reference, masked email, time) in
          this tab so the status page can be refreshed. No answers are stored.
        </li>
        <li>
          We do not use advertising cookies.{' '}
          <Placeholder>confirm cookie position before launch</Placeholder>
        </li>
      </ul>

      <h2>3. Legal basis</h2>
      <p>
        We process your information to perform the contract you enter when you buy a Report, and for
        our legitimate interests in running a secure service.{' '}
        <Placeholder>legal review for UK GDPR, US state privacy laws and the Australian Privacy Act</Placeholder>
      </p>

      <h2>4. Sharing</h2>
      <ul>
        <li>
          Payment provider: <Placeholder>name</Placeholder>, to take payment.
        </li>
        <li>
          Email provider: <Placeholder>name</Placeholder>, to send your Report and order emails.
        </li>
        <li>
          Hosting and storage: <Placeholder>names and regions</Placeholder>.
        </li>
        <li>
          Research tools:{' '}
          <Placeholder>owner to state whether answers are sent to any third-party research or AI service, and under what terms</Placeholder>
        </li>
      </ul>
      <p>We do not sell personal information.</p>

      <h2>5. Retention</h2>
      <p>
        <Placeholder>owner to decide: e.g. answers and Reports kept for X months after delivery to support re-sends and refunds, then deleted; payment records kept as required by tax law</Placeholder>
      </p>

      <h2>6. International transfers</h2>
      <p>
        Customers are in the UK, US and Australia and our providers may process data in other
        countries. <Placeholder>describe safeguards once providers are chosen</Placeholder>
      </p>

      <h2>7. Your rights</h2>
      <p>
        Depending on where you live, you may have rights to access, correct, delete or receive a copy
        of your information, to object to or restrict processing, and to complain to a regulator. To
        exercise these rights, contact {COMPANY.supportEmail}.{' '}
        <Placeholder>name the relevant regulators per market</Placeholder>
      </p>

      <h2>8. Security</h2>
      <p>
        We use HTTPS, reputable providers and access controls. No method is perfectly secure; please
        do not include information in your answers that you would not want held by a third party.
      </p>

      <h2>9. Changes</h2>
      <p>
        We will post updates here with a new date.{' '}
        <Placeholder>owner to decide on notification approach</Placeholder>
      </p>
    </LegalLayout>
  );
}
