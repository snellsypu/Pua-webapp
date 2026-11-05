import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import Home from "@/pages/Home";
import Calendar from "@/pages/Calendar";
import Habits from "@/pages/Habits";
import Planner from "@/pages/Planner";
import Overview from "@/pages/Overview";
import Settings from "@/pages/Settings";
import Health from "@/pages/Health";
import NotFound from "@/pages/NotFound";
import Sharing from "@/pages/Sharing";
import SharedPlannerPage from "@/pages/SharedPlanner";
import JoinBouquet from "@/pages/JoinBouquet";
import StatsPage from "@/pages/Stats";
import WorkPage from "@/pages/Work";
import Anniversaries from "@/pages/Anniversaries";
import { PaymentCancel, PaymentSuccess } from "@/pages/Payment";
import { AuthGate } from "@/lib/auth";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <AuthGate>
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/habits" element={<Habits />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/overview" element={<Overview />} />
        {/* old links (bookmarks, earlier notifications) */}
        <Route path="/morning" element={<Navigate to="/overview?view=today" replace />} />
        <Route path="/evening" element={<Navigate to="/overview?view=tomorrow" replace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/health" element={<Health />} />
        <Route path="/sharing" element={<Sharing />} />
        <Route path="/shared/:ownerId" element={<SharedPlannerPage />} />
        <Route path="/join/:code" element={<JoinBouquet />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/work" element={<WorkPage />} />
        <Route path="/anniversaries" element={<Anniversaries />} />
        <Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/payment/cancel" element={<PaymentCancel />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </AuthGate>
  );
}
