import { Routes, Route } from "react-router-dom";
import AppShell from "@/components/AppShell";
import Home from "@/pages/Home";
import Calendar from "@/pages/Calendar";
import Habits from "@/pages/Habits";
import Planner from "@/pages/Planner";
import Morning from "@/pages/Morning";
import Evening from "@/pages/Evening";
import Settings from "@/pages/Settings";
import Health from "@/pages/Health";
import NotFound from "@/pages/NotFound";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/habits" element={<Habits />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/morning" element={<Morning />} />
        <Route path="/evening" element={<Evening />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/health" element={<Health />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
