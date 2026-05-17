"use client";
import useSWR from "swr";
import { Activity, AlertTriangle, CheckCircle2, Cpu, Users } from "lucide-react";
import { Card } from "@/components/Card";
import { Stat } from "@/components/Stat";
import { StatusBadge } from "@/components/Badge";
import { Skeleton, ErrorState, EmptyState } from "@/components/States";
import { Sparkline } from "@/components/Sparkline";
import { endpoints } from "@/lib/api";
import { formatPercent, formatRelative } from "@/lib/utils";
import type { SystemHealth, Worker, InterviewSession, SessionStatistics } from "@/lib/types";
import { useEffect, useState } from "react";

export default function OverviewPage() {
  const health = useSWR<SystemHealth>("/system-health", { refreshInterval: 3000 });
  const workers = useSWR<{ workers: Worker[]; healthy_workers: number; total_workers: number }>("/workers", { refreshInterval: 5000 });
  const stats = useSWR<SessionStatistics>("/session-statistics", { refreshInterval: 5000 });
  const active = useSWR<{ count: number; sessions: InterviewSession[] }>("/active-sessions", { refreshInterval: 3000 });

  // Sparkline history: keep last 20 samples of completed & failed counts
  const [completedHist, setCompletedHist] = useState<number[]>([]);
  const [failedHist, setFailedHist] = useState<number[]>([]);
  const [riskHist, setRiskHist] = useState<number[]>([]);
  useEffect(() => {
    if (!stats.data) return;
    setCompletedHist((h) => [...h, stats.data!.completed_sessions].slice(-20));
    setFailedHist((h) => [...h, stats.data!.failed_sessions].slice(-20));
    setRiskHist((h) => [...h, stats.data!.risk_score_stats.average_risk_score].slice(-20));
  }, [stats.data?.completed_sessions, stats.data?.failed_sessions, stats.data?.risk_score_stats.average_risk_score]);

  const utilization = (workers.data?.workers ?? []).reduce(
    (acc, w) => acc + (w.capacity ? (w.active_tasks / w.capacity) * 100 : 0), 0
  ) / Math.max(1, workers.data?.workers.length ?? 1);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Overview</h1>
        <p className="text-sm text-muted">Real-time system health and throughput.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="System"
          value={health.data ? <StatusBadge status={health.data.overall_status} /> : <Skeleton className="h-7 w-20" />}
          hint={health.data ? `Updated ${formatRelative(health.data.timestamp)}` : ""}
          icon={<Activity size={16} />}
        />
        <Stat
          label="Workers"
          value={workers.data ? `${workers.data.healthy_workers}/${workers.data.total_workers}` : <Skeleton className="h-7 w-12" />}
          hint={workers.data ? `${formatPercent(utilization)} utilization` : ""}
          icon={<Users size={16} />}
        />
        <Stat
          label="Completed"
          value={stats.data ? stats.data.completed_sessions : <Skeleton className="h-7 w-12" />}
          hint={stats.data ? `${stats.data.active_sessions} active · ${stats.data.failed_sessions} failed` : ""}
          icon={<CheckCircle2 size={16} />}
        />
        <Stat
          label="Avg risk"
          value={stats.data ? stats.data.risk_score_stats.average_risk_score.toFixed(3) : <Skeleton className="h-7 w-16" />}
          hint={stats.data ? `${stats.data.risk_score_stats.high_risk_sessions} high risk` : ""}
          icon={<AlertTriangle size={16} />}
        />
      </div>

      {/* Sparkline row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="Completed sessions" description="Last 20 samples">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-semibold text-zinc-50">
              {stats.data?.completed_sessions ?? "—"}
            </div>
            <Sparkline data={completedHist} color="#10b981" width={140} height={40} />
          </div>
        </Card>
        <Card title="Failed sessions" description="Last 20 samples">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-semibold text-zinc-50">
              {stats.data?.failed_sessions ?? "—"}
            </div>
            <Sparkline data={failedHist} color="#ef4444" width={140} height={40} />
          </div>
        </Card>
        <Card title="Average risk" description="Last 20 samples">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-semibold text-zinc-50">
              {stats.data?.risk_score_stats.average_risk_score.toFixed(3) ?? "—"}
            </div>
            <Sparkline data={riskHist} color="#f59e0b" width={140} height={40} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Component health" description="Live status of each dependency.">
          {health.error ? (
            <ErrorState error={health.error} onRetry={() => health.mutate()} />
          ) : !health.data ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <ul className="space-y-2 text-sm">
              {Object.entries(health.data.components).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between rounded-md border border-border bg-bg-card px-3 py-2">
                  <span className="capitalize text-zinc-300">{k}</span>
                  <StatusBadge status={(v as { status: string }).status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Active sessions" description="In-flight interviews across the cluster.">
          {active.error ? (
            <ErrorState error={active.error} onRetry={() => active.mutate()} />
          ) : !active.data ? (
            <Skeleton className="h-32 w-full" />
          ) : active.data.sessions.length === 0 ? (
            <EmptyState title="No active sessions" description="Start a new interview to see it here." />
          ) : (
            <ul className="space-y-2 text-sm">
              {active.data.sessions.slice(0, 6).map((s) => (
                <li key={s.session_id} className="flex items-center justify-between rounded-md border border-border bg-bg-card px-3 py-2">
                  <div>
                    <div className="font-mono text-xs text-zinc-300">{s.session_id}</div>
                    <div className="text-xs text-muted">{s.candidate_id}</div>
                  </div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Workers" description="Currently registered worker nodes.">
        {workers.error ? (
          <ErrorState error={workers.error} onRetry={() => workers.mutate()} />
        ) : !workers.data ? (
          <Skeleton className="h-24 w-full" />
        ) : workers.data.workers.length === 0 ? (
          <EmptyState title="No workers registered" description="Workers self-register via the worker_agent on startup." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-4">Worker</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Load</th>
                  <th className="py-2 pr-4">Last heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {workers.data.workers.map((w) => (
                  <tr key={w.worker_id} className="border-t border-border">
                    <td className="py-2 pr-4 font-mono text-xs text-zinc-200">{w.worker_id}</td>
                    <td className="py-2 pr-4"><StatusBadge status={w.health_status} /></td>
                    <td className="py-2 pr-4">{w.active_tasks}/{w.capacity}</td>
                    <td className="py-2 pr-4 text-muted">{formatRelative(w.last_heartbeat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
