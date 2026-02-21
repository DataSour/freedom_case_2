import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, Filter, X, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Dropdown } from '../components/ui/Dropdown';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { api } from '../api/client';
import type { Manager, TicketListItem } from '../api/types';

export function Tickets() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadManagers = async () => {
      try {
        const res = await api.listManagers();
        if (active) setManagers(res.items || []);
      } catch {
        if (active) setManagers([]);
      }
    };
    loadManagers();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadTickets = async () => {
      setLoading(true);
      setError('');
      try {
        const statusParam = unassignedOnly ? 'UNASSIGNED' : statusFilter;
        const res = await api.listTickets({
          status: statusParam,
          office: officeFilter,
          language: languageFilter,
          q: searchQuery,
          limit: '200',
          offset: '0',
        });
        if (active) setTickets(res.items || []);
      } catch (e: any) {
        if (active) setError(e?.message || 'Failed to load tickets');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadTickets();
    return () => {
      active = false;
    };
  }, [searchQuery, officeFilter, statusFilter, languageFilter, unassignedOnly]);

  const managerMap = useMemo(() => {
    const map = new Map<string, Manager>();
    managers.forEach(m => map.set(m.id, m));
    return map;
  }, [managers]);

  const filteredTickets = tickets.filter(ticket => {
    const typeVal = normalizeType(ticket.type);
    const sentimentVal = normalizeSentiment(ticket.sentiment);
    if (typeFilter && typeVal !== typeFilter) return false;
    if (sentimentFilter && sentimentVal !== sentimentFilter) return false;
    return true;
  });

  const resetFilters = () => {
    setOfficeFilter('');
    setStatusFilter('');
    setTypeFilter('');
    setSentimentFilter('');
    setLanguageFilter('');
    setUnassignedOnly(false);
    setSearchQuery('');
  };

  const hasActiveFilters = officeFilter || statusFilter || typeFilter || sentimentFilter || languageFilter || unassignedOnly || searchQuery;

  const getSentimentVariant = (sentiment: string) => {
    if (sentiment === 'Positive') return 'positive';
    if (sentiment === 'Negative') return 'negative';
    return 'neutral';
  };

  const getStatusVariant = (status: string) => {
    if (status === 'Assigned') return 'success';
    if (status === 'Unassigned') return 'warning';
    return 'error';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'Assigned') return <CheckCircle2 className="w-3 h-3" />;
    if (status === 'Unassigned') return <Clock className="w-3 h-3" />;
    return <AlertTriangle className="w-3 h-3" />;
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return 'bg-red-500 text-white';
    if (priority >= 6) return 'bg-amber-500 text-white';
    if (priority >= 4) return 'bg-blue-500 text-white';
    return 'bg-gray-400 text-white';
  };

  const resolveAssignedManager = (managerId?: string | null) => {
    if (!managerId) return '';
    return managerMap.get(managerId)?.name || managerId;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1>Tickets</h1>
        <p className="text-[rgb(var(--color-muted-foreground))] mt-1">
          Manage and track all customer support tickets
        </p>
      </div>

      {/* Filters */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-[rgb(var(--color-muted-foreground))]" />
              <h3 className="font-medium">Filters</h3>
              {hasActiveFilters && (
                <Badge variant="primary">{filteredTickets.length} results</Badge>
              )}
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X className="w-4 h-4" />
                Clear Filters
              </Button>
            )}
          </div>

          <div className="grid grid-cols-6 gap-4">
            <Input
              placeholder="Search by ticket ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<Search className="w-4 h-4" />}
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
            <Dropdown
              options={[
                { value: '', label: 'All Status' },
                { value: 'ASSIGNED', label: 'Assigned' },
                { value: 'UNASSIGNED', label: 'Unassigned' },
                { value: 'ERROR', label: 'Error' }
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="Status"
            />
            <Dropdown
              options={[
                { value: '', label: 'All Types' },
                { value: 'Complaint', label: 'Complaint' },
                { value: 'Consultation', label: 'Consultation' },
                { value: 'Change of data', label: 'Change of data' },
                { value: 'Fraud', label: 'Fraud' },
                { value: 'Technical issue', label: 'Technical issue' }
              ]}
              value={typeFilter}
              onChange={setTypeFilter}
              placeholder="Type"
            />
            <Dropdown
              options={[
                { value: '', label: 'All Sentiment' },
                { value: 'Positive', label: 'Positive' },
                { value: 'Neutral', label: 'Neutral' },
                { value: 'Negative', label: 'Negative' }
              ]}
              value={sentimentFilter}
              onChange={setSentimentFilter}
              placeholder="Sentiment"
            />
            <Dropdown
              options={[
                { value: '', label: 'All Languages' },
                { value: 'RU', label: 'Russian' },
                { value: 'KZ', label: 'Kazakh' },
                { value: 'ENG', label: 'English' }
              ]}
              value={languageFilter}
              onChange={setLanguageFilter}
              placeholder="Language"
            />
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-[rgb(var(--color-border))]">
            <Toggle
              checked={unassignedOnly}
              onChange={setUnassignedOnly}
              label="Show unassigned only"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding={false}>
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[rgb(var(--color-muted))] flex items-center justify-center">
              <Clock className="w-8 h-8 text-[rgb(var(--color-muted-foreground))]" />
            </div>
            <h3 className="font-medium mb-2">Loading tickets...</h3>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[rgb(var(--color-muted))] flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-[rgb(var(--color-error))]" />
            </div>
            <h3 className="font-medium mb-2">Failed to load tickets</h3>
            <p className="text-sm text-[rgb(var(--color-muted-foreground))]">{error}</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[rgb(var(--color-muted))] flex items-center justify-center">
              <Search className="w-8 h-8 text-[rgb(var(--color-muted-foreground))]" />
            </div>
            <h3 className="font-medium mb-2">No tickets found</h3>
            <p className="text-sm text-[rgb(var(--color-muted-foreground))]">
              Try adjusting your filters or search query
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-muted))] sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Ticket ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Segment</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">City</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Language</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Sentiment</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Assigned Manager</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Office</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[rgb(var(--color-muted-foreground))] uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--color-border))]">
                {filteredTickets.map((ticket) => {
                  const statusLabel = normalizeStatus(ticket.status);
                  const sentimentLabel = normalizeSentiment(ticket.sentiment) || 'Neutral';
                  return (
                    <tr 
                      key={ticket.id} 
                      onClick={() => navigate(`/tickets/${ticket.id}`)}
                      className="hover:bg-[rgb(var(--color-muted))] cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-medium text-[rgb(var(--color-primary))]">
                          {ticket.id}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={ticket.segment?.toUpperCase() === 'VIP' ? 'primary' : 'secondary'}>
                          {ticket.segment}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm">{ticket.city}</span>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="secondary" size="sm">{ticket.language || '—'}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm">{normalizeType(ticket.type) || '—'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={getSentimentVariant(sentimentLabel)}>
                          {sentimentLabel}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${getPriorityColor(ticket.priority ?? 0)}`}>
                          {ticket.priority ?? '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {ticket.manager_id ? (
                          <span className="text-sm">{resolveAssignedManager(ticket.manager_id)}</span>
                        ) : (
                          <span className="text-sm text-[rgb(var(--color-muted-foreground))]">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {ticket.office ? (
                          <Badge variant="secondary">{ticket.office}</Badge>
                        ) : (
                          <span className="text-sm text-[rgb(var(--color-muted-foreground))]">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={getStatusVariant(statusLabel)}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(statusLabel)}
                            {statusLabel}
                          </div>
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-[rgb(var(--color-muted-foreground))]">
                          {new Date(ticket.created_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {filteredTickets.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[rgb(var(--color-muted-foreground))]">
            Showing <span className="font-medium">{filteredTickets.length}</span> of{' '}
            <span className="font-medium">{tickets.length}</span> tickets
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled>Previous</Button>
            <Button variant="outline" size="sm" disabled>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeStatus(status?: string | null) {
  if (!status) return 'Unassigned';
  if (status === 'ASSIGNED') return 'Assigned';
  if (status === 'UNASSIGNED') return 'Unassigned';
  if (status === 'ERROR') return 'Error';
  return status;
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
