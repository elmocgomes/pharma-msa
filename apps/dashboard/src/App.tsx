import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import { OverviewPage } from '@/pages/OverviewPage';
import { SessionsPage } from '@/pages/SessionsPage';
import { CampaignsPage } from '@/pages/CampaignsPage';
import { ConversationsPage } from '@/pages/ConversationsPage';
import { ConversationDetailPage } from '@/pages/ConversationDetailPage';
import { PharmaciesPage } from '@/pages/PharmaciesPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { PromptsPage } from '@/pages/PromptsPage';
import { Navigate } from 'react-router-dom';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/conversations" element={<ConversationsPage />} />
            <Route path="/conversations/:id" element={<ConversationDetailPage />} />
            <Route path="/pharmacies" element={<PharmaciesPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/prompts" element={<PromptsPage />} />
            <Route path="/anvisa" element={<Navigate to="/products" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
