import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  TrendingUp,
  TrendingDown,
  Users,
  AlertCircle,
  CheckCircle2,
  Upload,
  Play,
  Eye,
  Info
} from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ProgressBar } from '../components/ui/ProgressBar';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { DocumentationPanel } from '../components/DocumentationPanel';
import { api } from '../api/client';
import type { Manager, TicketListItem } from '../api/types';
import { useToast } from '../components/ui/Toast';

function KPICard({ title, value, subtitle, trend, icon: Icon, variant = 'default' }: any) {
  const variants = {
    default: 'text-[rgb(var(--color-foreground))]',
    success: 'text-[rgb(var(--color-success))]',
    warning: 'text-[rgb(var(--color-warning))]',
    error: 'text-[rgb(var(--color-error))]',
  };

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[rgb(var(--color-muted-foreground))] mb-1">{title}</p>
          <h3 className={`text-3xl font-bold ${variants[variant]}`}>{value}</h3>
          {subtitle && (
            <p className="text-sm text-[rgb(var(--color-muted-foreground))] mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${variant === 'default' ? 'bg-[rgb(var(--color-muted))]' : `bg-${variant}-100 dark:bg-${variant}-950`}`}>
          <Icon className={`w-6 h-6 ${variants[variant]}`} />
        </div>
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-3">
          {trend > 0 ? (
            <TrendingUp className="w-4 h-4 text-[rgb(var(--color-success))]" />
          ) : (
            <TrendingDown className="w-4 h-4 text-[rgb(var(--color-error))]" />
          )}
          <span className={`text-sm font-medium ${trend > 0 ? 'text-[rgb(var(--color-success))]' : 'text-[rgb(var(--color-error))]'}`}>
            {Math.abs(trend)}%
          </span>
          <span className="text-sm text-[rgb(var(--color-muted-foreground))]">vs last week</span>
        </div>
      )}
    </Card>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [showDocs, setShowDocs] = useState(false);
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setLoading(true);
      try {
        const [ticketsRes, managersRes] = await Promise.all([
          api.listTickets({ limit: '500', offset: '0' }),
          api.listManagers(),
        ]);
        if (active) {
          setTickets(ticketsRes.items || []);
          setManagers(managersRes.items || []);
        }
      } catch (e: any) {
        if (active) showToast(e?.message || 'Failed to load dashboard data', 'error');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => {
      active = false
    }
  }, []);

  const analytics = useMemo(() => {
    const totalTickets = tickets.length;
    const assigned = tickets.filter(t => t.status === 'ASSIGNED').length;
    const unassigned = tickets.filter(t => t.status === 'UNASSIGNED' || !t.status).length;
    const errors = tickets.filter(t => t.status === 'ERROR').length;
    const priorities = tickets.map(t => t.priority).filter(v => typeof v === 'number') as number[];
    const avgPriority = priorities.length ? priorities.reduce((a, b) => a + b, 0) / priorities.length : 0;

    const sentimentCounts = { Positive: 0, Neutral: 0, Negative: 0 };
    const typeCounts: Record<string, number> = {};
    tickets.forEach(t => {
      const s = normalizeSentiment(t.sentiment) || 'Neutral';
      sentimentCounts[s as keyof typeof sentimentCounts] += 1;
      const type = normalizeType(t.type) || 'Other';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    const negativeSentimentPct = totalTickets ? Math.round((sentimentCounts.Negative / totalTickets) * 100) : 0;

    const ticketTypes = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

    const sentimentDistribution = [
      { name: 'Positive', value: sentimentCounts.Positive, color: '#22c55e' },
      { name: 'Neutral', value: sentimentCounts.Neutral, color: '#a8a29e' },
      { name: 'Negative', value: sentimentCounts.Negative, color: '#ef4444' }
    ];

    const officeMap: Record<string, number> = {};
    tickets.forEach(t => {
      const key = t.office || 'Unassigned';
      officeMap[key] = (officeMap[key] || 0) + 1;
    });

    const officeDistribution = Object.entries(officeMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.name !== 'Unassigned');

    const unassignedCount = officeMap['Unassigned'] || unassigned;

    const ticketsOverTime = buildLast7Days(tickets);

    return {
      totalTickets,
      assigned,
      unassigned,
      errors,
      avgPriority,
      negativeSentimentPct,
      ticketTypes,
      sentimentDistribution,
      officeDistribution,
      unassignedCount,
      ticketsOverTime,
    };
  }, [tickets]);

  const systemErrors = useMemo(() => {
    return tickets
      .filter(t => t.status === 'ERROR')
      .slice(0, 5)
      .map(t => ({
        id: t.id,
        timestamp: t.created_at,
        code: t.reason_code || 'ERROR',
        message: `Failed to assign ticket ${t.id}`,
        reason: t.reason_text || 'Unknown error',
      }));
  }, [tickets]);

  const managerRows = [...managers]
    .sort((a, b) => (b.current_load || 0) - (a.current_load || 0))
    .slice(0, 6)
    .map(m => ({
    ...m,
    capacity: Math.max(20, m.current_load + 5),
  }));

  const handleRunProcessing = async () => {
    setIsProcessing(true);
    try {
      await api.processTickets();
      showToast('Processing completed', 'success');
      const updated = await api.listTickets({ limit: '500', offset: '0' });
      setTickets(updated.items || []);
    } catch (e: any) {
      showToast(e?.message || 'Processing failed', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1>Dashboard</h1>
          <p className="text-[rgb(var(--color-muted-foreground))] mt-1">
            Real-time ticket processing and assignment overview
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setShowDocs(!showDocs)}>
            <Info className="w-4 h-4" />
            {showDocs ? 'Hide' : 'Show'} Documentation
          </Button>
          <Button variant="outline" onClick={() => navigate('/import')}>
            <Upload className="w-4 h-4" />
            Import CSV
          </Button>
          <Button variant="primary" onClick={handleRunProcessing} disabled={isProcessing} loading={isProcessing}>
            <Play className="w-4 h-4" />
            Run Processing
          </Button>
        </div>
      </div>

      {/* Documentation Panel */}
      {showDocs && <DocumentationPanel />}

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        <KPICard
          title="Total Tickets"
          value={analytics.totalTickets}
          subtitle="Last 7 days"
          trend={12}
          icon={CheckCircle2}
          variant="default"
        />
        <KPICard
          title="Assigned"
          value={analytics.assigned}
          subtitle={analytics.totalTickets ? `${((analytics.assigned / analytics.totalTickets) * 100).toFixed(1)}% success rate` : '—'}
          trend={8}
          icon={CheckCircle2}
          variant="success"
        />
        <KPICard
          title="Unassigned"
          value={analytics.unassigned}
          subtitle="Awaiting assignment"
          icon={AlertCircle}
          variant="warning"
        />
        <KPICard
          title="Avg Priority"
          value={analytics.avgPriority.toFixed(1)}
          subtitle="Out of 10"
          icon={TrendingUp}
          variant="default"
        />
        <KPICard
          title="Negative Sentiment"
          value={`${analytics.negativeSentimentPct}%`}
          subtitle={`${analytics.sentimentDistribution[2].value} tickets`}
          trend={-5}
          icon={AlertCircle}
          variant="error"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-6">
        {/* Ticket Types */}
        <Card>
          <CardHeader title="Ticket Types" description="Distribution by category" />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={analytics.ticketTypes}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
              <XAxis dataKey="name" tick={{ fill: 'rgb(var(--color-muted-foreground))' }} fontSize={12} />
              <YAxis tick={{ fill: 'rgb(var(--color-muted-foreground))' }} fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgb(var(--color-card))',
                  border: '1px solid rgb(var(--color-border))',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="value" fill="rgb(var(--color-primary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Sentiment Distribution */}
        <Card>
          <CardHeader title="Sentiment Analysis" description="Overall ticket sentiment" />
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={analytics.sentimentDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {analytics.sentimentDistribution.map((entry, index) => (
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
            {analytics.sentimentDistribution.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-[rgb(var(--color-muted-foreground))]">
                  {item.name}: {item.value}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Tickets Over Time */}
        <Card>
          <CardHeader title="Ticket Volume" description="Last 7 days trend" />
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={analytics.ticketsOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
              <XAxis dataKey="date" tick={{ fill: 'rgb(var(--color-muted-foreground))' }} fontSize={12} />
              <YAxis tick={{ fill: 'rgb(var(--color-muted-foreground))' }} fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgb(var(--color-card))',
                  border: '1px solid rgb(var(--color-border))',
                  borderRadius: '8px'
                }}
              />
              <Line type="monotone" dataKey="count" stroke="rgb(var(--color-primary))" strokeWidth={2} dot={{ fill: 'rgb(var(--color-primary))' }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Office Distribution & Manager Load */}
      <div className="grid grid-cols-2 gap-6">
        {/* Office Split */}
        <Card>
          <CardHeader title="Office Distribution" description="Ticket assignment by location" />
          <div className="space-y-4">
            {analytics.officeDistribution.slice(0, 5).map((office, idx) => (
              <div key={office.name}>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${idx % 2 === 0 ? 'bg-indigo-500' : 'bg-purple-500'}`} />
                    <span className="text-sm font-medium">{office.name}</span>
                  </div>
                  <span className="text-sm font-medium">{office.value}</span>
                </div>
                <ProgressBar
                  value={office.value}
                  max={analytics.totalTickets || 1}
                  variant={idx % 2 === 0 ? 'default' : 'success'}
                />
              </div>
            ))}
            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400" />
                  <span className="text-sm font-medium">Unassigned</span>
                </div>
                <span className="text-sm font-medium">{analytics.unassignedCount}</span>
              </div>
              <ProgressBar
                value={analytics.unassignedCount}
                max={analytics.totalTickets || 1}
                variant="warning"
              />
            </div>
          </div>
        </Card>

        {/* Manager Load */}
        <Card padding={false}>
          <div className="p-6">
            <CardHeader title="Manager Workload" description="Current assignment distribution" className="mb-0" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-y border-[rgb(var(--color-border))] bg-[rgb(var(--color-muted))]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Manager</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Office</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Skills</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Load</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--color-border))]">
                {managerRows.map((manager) => (
                  <tr key={manager.id} className="hover:bg-[rgb(var(--color-muted))] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                          <Users className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{manager.name}</p>
                          <p className="text-xs text-[rgb(var(--color-muted-foreground))]">{manager.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="secondary">{manager.office}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {manager.skills.map((skill) => (
                          <Badge key={skill} variant="primary" size="sm">{skill}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <ProgressBar
                            value={manager.current_load}
                            max={manager.capacity}
                            variant={manager.current_load / manager.capacity > 0.8 ? 'warning' : 'success'}
                            size="sm"
                          />
                        </div>
                        <span className="text-sm font-medium whitespace-nowrap">
                          {manager.current_load}/{manager.capacity}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Recent Errors */}
      <Card>
        <CardHeader
          title="Recent System Errors"
          description="Latest processing issues requiring attention"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/tickets')}>
              <Eye className="w-4 h-4" />
              View All
            </Button>
          }
        />
        {loading ? (
          <div className="p-6 text-sm text-[rgb(var(--color-muted-foreground))]">Loading errors...</div>
        ) : systemErrors.length === 0 ? (
          <div className="p-6 text-sm text-[rgb(var(--color-muted-foreground))]">No recent errors.</div>
        ) : (
          <div className="space-y-3">
            {systemErrors.map((error) => (
              <div
                key={error.id}
                className="p-4 rounded-lg border border-[rgb(var(--color-border))] bg-red-50 dark:bg-red-950/20 flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-[rgb(var(--color-error))] flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-[rgb(var(--color-foreground))]">{error.message}</p>
                      <p className="text-sm text-[rgb(var(--color-muted-foreground))] mt-1">{error.reason}</p>
                    </div>
                    <Badge variant="error">{error.code}</Badge>
                  </div>
                  <p className="text-xs text-[rgb(var(--color-muted-foreground))] mt-2">
                    {new Date(error.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function normalizeSentiment(sentiment?: string | null) {
  if (!sentiment) return '';
  const s = sentiment.toLowerCase();
  if (s === 'positive') return 'Positive';
  if (s === 'negative') return 'Negative';
  if (s === 'neutral') return 'Neutral';
  return sentiment;
}

function normalizeType(type?: string | null) {
  if (!type) return '';
  const t = type.toLowerCase();
  if (t === 'change of data') return 'Change of data';
  if (t === 'technical issue') return 'Technical issue';
  if (t === 'consultation') return 'Consultation';
  if (t === 'complaint') return 'Complaint';
  if (t === 'fraud') return 'Fraud';
  return type;
}

function buildLast7Days(tickets: TicketListItem[]) {
  const now = new Date();
  const days: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const key = d.toISOString().slice(0, 10);
    const count = tickets.filter(t => t.created_at?.slice(0, 10) === key).length;
    days.push({ date: label, count });
  }
  return days;
}
