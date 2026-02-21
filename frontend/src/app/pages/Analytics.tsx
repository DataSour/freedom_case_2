import React, { useEffect, useMemo, useState } from 'react';
import { Download, Calendar } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Dropdown } from '../components/ui/Dropdown';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { api } from '../api/client';
import type { Manager, TicketListItem } from '../api/types';

export function Analytics() {
  const [dateRange, setDateRange] = useState('7d');
  const [officeFilter, setOfficeFilter] = useState('');
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [ticketsRes, managersRes] = await Promise.all([
          api.listTickets({ limit: '1000', offset: '0' }),
          api.listManagers(),
        ]);
        if (active) {
          setTickets(ticketsRes.items || []);
          setManagers(managersRes.items || []);
        }
      } catch {
        if (active) {
          setTickets([]);
          setManagers([]);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const filteredTickets = useMemo(() => {
    const days = dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days + 1);
    return tickets.filter(t => {
      if (!t.created_at) return false;
      const created = new Date(t.created_at);
      if (created < cutoff) return false;
      if (officeFilter && t.office !== officeFilter) return false;
      return true;
    });
  }, [tickets, dateRange, officeFilter]);

  const assignmentsByOffice = useMemo(() => {
    const offices = ['Astana', 'Almaty'];
    return offices.map(office => {
      const assigned = filteredTickets.filter(t => t.office === office && t.status === 'ASSIGNED').length;
      const unassigned = filteredTickets.filter(t => t.office === office && t.status === 'UNASSIGNED').length;
      return { office, assigned, unassigned };
    });
  }, [filteredTickets]);

  const assignmentSuccessRate = useMemo(() => {
    const days = dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 7;
    const now = new Date();
    const out: { date: string; rate: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayTickets = filteredTickets.filter(t => t.created_at?.slice(0, 10) === key);
      const assigned = dayTickets.filter(t => t.status === 'ASSIGNED').length;
      const rate = dayTickets.length ? Math.round((assigned / dayTickets.length) * 100) : 0;
      out.push({ date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), rate });
    }
    return out;
  }, [filteredTickets, dateRange]);

  const unassignedReasons = useMemo(() => {
    const reasonMap: Record<string, number> = {};
    filteredTickets.forEach(t => {
      if (t.status === 'UNASSIGNED') {
        const reason = t.reason_code || 'NO_ELIGIBLE_MANAGERS';
        reasonMap[reason] = (reasonMap[reason] || 0) + 1;
      }
    });
    const colors = ['#ef4444', '#f59e0b', '#eab308', '#6366f1', '#22c55e'];
    return Object.entries(reasonMap).map(([reason, value], idx) => ({ reason, value, color: colors[idx % colors.length] }));
  }, [filteredTickets]);

  const managerLoadOverTime = useMemo(() => {
    const days = dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 7;
    const now = new Date();
    const managerCount = managers.length || 1;
    const out: { date: string; avgLoad: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayTickets = filteredTickets.filter(t => t.created_at?.slice(0, 10) === key && t.status === 'ASSIGNED');
      const avgLoad = Math.round((dayTickets.length / managerCount) * 100);
      out.push({ date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), avgLoad });
    }
    return out;
  }, [filteredTickets, managers, dateRange]);

  const fairnessMetrics = useMemo(() => {
    const loads = managers.map(m => m.current_load);
    const avg = loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : 0;
    const variance = loads.length ? loads.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / loads.length : 0;
    const std = Math.sqrt(variance);
    const loadBalance = avg ? Math.max(0, Math.round(100 - (std / avg) * 100)) : 0;

    const requiredSkills = new Set<string>();
    filteredTickets.forEach(t => {
      if (t.language) requiredSkills.add(t.language);
      if (t.segment?.toUpperCase() == 'VIP') requiredSkills.add('VIP');
    });

    const utilized = managers.filter(m => m.skills.some(s => requiredSkills.has(s))).length;
    const skillUtil = managers.length ? Math.round((utilized / managers.length) * 100) : 0;

    const astana = filteredTickets.filter(t => t.office === 'Astana').length;
    const almaty = filteredTickets.filter(t => t.office === 'Almaty').length;

    return [
      { metric: 'Load Balance Score', value: `${loadBalance}%`, description: 'Based on current manager workload' },
      { metric: 'Skill Utilization', value: `${skillUtil}%`, description: 'Managers covering active skill needs' },
      { metric: 'Office Distribution', value: `${astana}/${almaty}`, description: 'Astana vs Almaty split ratio' },
      { metric: 'Avg Response Time', value: '—', description: 'Not tracked in current dataset' }
    ];
  }, [managers, filteredTickets]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Analytics</h1>
          <p className="text-[rgb(var(--color-muted-foreground))] mt-1">
            Performance metrics and fairness insights
          </p>
        </div>
        <div className="flex gap-3">
          <Dropdown
            options={[
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' }
            ]}
            value={dateRange}
            onChange={setDateRange}
            placeholder="Date range"
          />
          <Dropdown
            options={[
              { value: '', label: 'All Offices' },
              { value: 'Astana', label: 'Astana' },
              { value: 'Almaty', label: 'Almaty' }
            ]}
            value={officeFilter}
            onChange={setOfficeFilter}
            placeholder="Office"
          />
          <Button variant="outline">
            <Calendar className="w-4 h-4" />
            Custom Range
          </Button>
          <Button variant="primary">
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Fairness Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {fairnessMetrics.map((metric) => (
          <Card key={metric.metric}>
            <div>
              <p className="text-sm text-[rgb(var(--color-muted-foreground))] mb-1">{metric.metric}</p>
              <h3 className="text-2xl font-bold text-[rgb(var(--color-foreground))] mb-2">{metric.value}</h3>
              <p className="text-xs text-[rgb(var(--color-muted-foreground))]">{metric.description}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Assignments by Office" description="Distribution across locations" />
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={assignmentsByOffice}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
              <XAxis dataKey="office" tick={{ fill: 'rgb(var(--color-muted-foreground))' }} />
              <YAxis tick={{ fill: 'rgb(var(--color-muted-foreground))' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgb(var(--color-card))',
                  border: '1px solid rgb(var(--color-border))',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="assigned" fill="rgb(var(--color-success))" name="Assigned" radius={[8, 8, 0, 0]} />
              <Bar dataKey="unassigned" fill="rgb(var(--color-warning))" name="Unassigned" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardHeader title="Assignment Success Rate" description="Daily success percentage" />
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={assignmentSuccessRate}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
              <XAxis dataKey="date" tick={{ fill: 'rgb(var(--color-muted-foreground))' }} />
              <YAxis tick={{ fill: 'rgb(var(--color-muted-foreground))' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgb(var(--color-card))',
                  border: '1px solid rgb(var(--color-border))',
                  borderRadius: '8px'
                }}
              />
              <Line type="monotone" dataKey="rate" stroke="rgb(var(--color-primary))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Unassigned Reasons" description="Why tickets couldn't be assigned" />
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={unassignedReasons}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {unassignedReasons.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgb(var(--color-card))',
                  border: '1px solid rgb(var(--color-border))',
                  borderRadius: '8px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-4">
            {unassignedReasons.map((item) => (
              <div key={item.reason} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-[rgb(var(--color-muted-foreground))]">
                  {item.reason}: {item.value}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Manager Load Over Time" description="Average workload percentage" />
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={managerLoadOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
              <XAxis dataKey="date" tick={{ fill: 'rgb(var(--color-muted-foreground))' }} />
              <YAxis tick={{ fill: 'rgb(var(--color-muted-foreground))' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgb(var(--color-card))',
                  border: '1px solid rgb(var(--color-border))',
                  borderRadius: '8px'
                }}
              />
              <Line type="monotone" dataKey="avgLoad" stroke="rgb(var(--color-primary))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
