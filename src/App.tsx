import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider, useAuth } from "./data/auth";
import { DataProvider, useData } from "./data/store";
import { FeedbackProvider } from "./components/feedback";
import { EditorsProvider } from "./components/editors";
import { AppLayout } from "./layouts/AppLayout";
import { Landing } from "./pages/Landing";
import { NoAccess } from "./pages/NoAccess";
import { Inventory } from "./pages/Inventory";
import { Repairs } from "./pages/Repairs";
import { Parts } from "./pages/Parts";
import { Expenses } from "./pages/Expenses";
import { Investments } from "./pages/Investments";

const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const SettingsPage = lazy(() => import("./pages/Settings").then((m) => ({ default: m.SettingsPage })));

function Spinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white" />
    </div>
  );
}

function SignedInApp() {
  const { loading, error } = useData();
  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div>
          <p className="font-medium">Couldn't load your data</p>
          <p className="mt-1 text-sm text-zinc-500">{error}</p>
        </div>
      </div>
    );
  }
  if (loading) return <Spinner />;
  return (
    <EditorsProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Suspense fallback={null}><Dashboard /></Suspense>} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="repairs" element={<Repairs />} />
          <Route path="parts" element={<Parts />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="investments" element={<Investments />} />
          <Route path="settings" element={<Suspense fallback={null}><SettingsPage /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </EditorsProvider>
  );
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Landing />;
  if (!user.allowed) return <NoAccess />;
  return (
    <DataProvider>
      <SignedInApp />
    </DataProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FeedbackProvider>
          <Root />
        </FeedbackProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
