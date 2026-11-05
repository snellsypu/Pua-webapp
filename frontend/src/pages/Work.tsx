// Work tab: your jobs + rotas, the week's shifts, and hours & estimated earnings.
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Briefcase } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { DayContext, WorkBlock } from "@/lib/types";
import { addDaysIso, fmtShort } from "@/lib/dates";
import { WorkBlockRow, WorkHoursCard, WorkRotaManager } from "@/components/WorkRota";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function WorkPage() {
  const todayQ = useQuery({ queryKey: ["overview", 0], queryFn: () => apiGet<DayContext>("/overview?offset=0") });
  const today = todayQ.data?.date;
  const until = today ? addDaysIso(today, 13) : "";
  const blocks = useQuery({
    queryKey: ["work-blocks", "next", today],
    queryFn: () => apiGet<WorkBlock[]>(`/jobs/blocks?from=${today}&to=${until}`),
    enabled: !!today,
  });
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-6" data-testid="work-page">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-3xl font-bold tracking-tight"><Briefcase className="size-7 text-sky-600" /> Work</h1>
        <p className="text-sm text-muted-foreground">Set up your jobs and rotas — shifts show on your calendar as &ldquo;Working&rdquo;, not as appointments.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="font-heading">Your jobs &amp; rotas</CardTitle>
            <CardDescription>Each job repeats on a 1, 2, 3 or 4-week rota. Free: 1 job · Premium: as many as you need.</CardDescription>
          </CardHeader>
          <CardContent>{today ? <WorkRotaManager today={today} /> : <div className="h-24 animate-pulse rounded-xl bg-muted" />}</CardContent>
        </Card>
        <div className="space-y-6 lg:col-span-5">
          <WorkHoursCard />
          <Card data-testid="work-upcoming-card">
            <CardHeader>
              <CardTitle className="font-heading">Next two weeks</CardTitle>
            </CardHeader>
            <CardContent>
              {blocks.data?.length ? (
                <ul className="space-y-1.5" data-testid="work-upcoming">
                  {blocks.data.map((b) => <WorkBlockRow key={`${b.jobId}-${b.date}`} b={b} who={b.date === today ? "Today" : fmtShort(b.date)} />)}
                </ul>
              ) : <p className="text-sm text-muted-foreground" data-testid="work-upcoming-empty">No shifts in the next two weeks.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
