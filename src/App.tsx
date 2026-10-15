import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { CheckoutReturnPage } from '@/pages/CheckoutReturnPage';
import { LandingPage } from '@/pages/LandingPage';
import { PrivacyPage } from '@/pages/legal/PrivacyPage';
import { RefundsPage } from '@/pages/legal/RefundsPage';
import { TermsPage } from '@/pages/legal/TermsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OwnerPilotPage } from '@/pages/OwnerPilotPage';
import { QuestionnairePage } from '@/pages/QuestionnairePage';
import { RecoverPage } from '@/pages/RecoverPage';
import { ReportStatusPage } from '@/pages/ReportStatusPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { SampleReportPage } from '@/pages/SampleReportPage';
import { QuestionnaireProvider } from '@/questionnaire/store';

export function App() {
  return (
    <BrowserRouter>
      <QuestionnaireProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<LandingPage />} />
            <Route path="validate" element={<Navigate to="/validate/1" replace />} />
            <Route path="validate/:step" element={<QuestionnairePage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="checkout/return" element={<CheckoutReturnPage />} />
            <Route path="report/:token" element={<ReportStatusPage />} />
            <Route path="sample-report" element={<SampleReportPage />} />
            <Route path="find-report" element={<RecoverPage />} />
            <Route path="terms" element={<TermsPage />} />
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="refunds" element={<RefundsPage />} />
            <Route path="owner/pilot" element={<OwnerPilotPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </QuestionnaireProvider>
    </BrowserRouter>
  );
}
