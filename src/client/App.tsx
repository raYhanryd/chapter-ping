import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/Shell";
import { ToastProvider } from "./components/ui";
import { Activity } from "./pages/Activity";
import { Dashboard } from "./pages/Dashboard";
import { Destinations } from "./pages/Destinations";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { NotFound } from "./pages/NotFound";
import { PublicSeries } from "./pages/PublicSeries";
import { SeriesDetail } from "./pages/SeriesDetail";
import { Settings } from "./pages/Settings";
import { Waitlist } from "./pages/Waitlist";

export function AppRoutes() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/waitlist" element={<Waitlist />} />
        <Route path="/s/:id" element={<PublicSeries />} />
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/series/:id" element={<SeriesDetail />} />
          <Route path="/destinations" element={<Destinations />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
