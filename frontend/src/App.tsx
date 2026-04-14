import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LoadingBlock from './components/common/LoadingBlock.tsx';
import ErrorBoundary from './components/common/ErrorBoundary.tsx';

const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage.tsx'));
const ShipmentDetailPage = lazy(() => import('./pages/shipments/ShipmentDetailPage.tsx'));

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<div className="flex h-screen items-center justify-center bg-slate-950"><LoadingBlock /></div>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/shipments/:shipmentId" element={<ShipmentDetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
