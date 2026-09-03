import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { FinancePanel } from "@/components/FinancePanel";
import { Header } from "@/components/Header";
import { HomeworkPanel } from "@/components/HomeworkPanel";
import { LightsPanel } from "@/components/LightsPanel";
import { ServicesGrid } from "@/components/ServicesGrid";
import TvDashboard from "@/components/TvDashboard";

export default function App() {
  if (window.location.pathname.replace(/\/$/, "") === "/tv") {
    return <TvDashboard />;
  }
  return <HomeDashboard />;
}

function HomeDashboard() {
  const configQ = useQuery({
    queryKey: ["config"],
    queryFn: api.config,
    staleTime: Infinity,
  });
  const roomsQ = useQuery({
    queryKey: ["rooms"],
    queryFn: api.rooms,
    refetchInterval: 5_000,
  });
  const weatherQ = useQuery({
    queryKey: ["weather"],
    queryFn: api.weather,
    refetchInterval: 60_000,
  });
  const financeQ = useQuery({
    queryKey: ["finance"],
    queryFn: () => api.finance(),
    refetchInterval: 60_000,
  });
  const homeworkQ = useQuery({
    queryKey: ["homework"],
    queryFn: api.homework,
    refetchInterval: 60_000,
  });
  const servicesQ = useQuery({
    queryKey: ["services"],
    queryFn: api.services,
    refetchInterval: 30_000,
  });

  const rooms = roomsQ.data?.rooms;
  const weather = weatherQ.data?.weather;
  const finance = financeQ.data;
  const homework = homeworkQ.data;
  const groups = servicesQ.data?.groups;
  const tz = configQ.data?.tz;

  return (
    <div className="h-full overflow-hidden">
      <div className="mx-auto flex min-h-full max-w-lg flex-col gap-5 overflow-y-auto px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] dash:hidden">
        <Header weather={weather ?? null} tz={tz} />
        <HomeworkPanel data={homework} />
        <LightsPanel rooms={rooms} />
        <FinancePanel summary={finance} />
        <ServicesGrid groups={groups} compact />
      </div>

      <div className="hidden h-full overflow-hidden dash:block">
        <div className="mx-auto flex h-full max-w-[1280px] flex-col gap-3 overflow-hidden px-5 py-3 lg:px-6">
          <Header weather={weather ?? null} tz={tz} />
          <div className="grid min-h-0 flex-1 grid-cols-12 gap-4 overflow-hidden">
            <div className="col-span-8 grid min-h-0 grid-rows-[auto_1fr] gap-3 overflow-hidden">
              <LightsPanel rooms={rooms} />
              <div className="min-h-0 overflow-hidden">
                <FinancePanel summary={finance} horizontal />
              </div>
            </div>
            <div className="col-span-4 grid min-h-0 grid-rows-[auto_1fr] gap-3 overflow-hidden">
              <HomeworkPanel data={homework} limit={4} />
              <div className="min-h-0 overflow-hidden">
                <ServicesGrid groups={groups} compact />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
