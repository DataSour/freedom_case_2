import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft,
  User,
  MapPin,
  Clock,
  AlertCircle,
  CheckCircle2,
  FileText,
  Zap,
  Users,
  Target,
  UserCog
} from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Dropdown } from '../components/ui/Dropdown';
import { Textarea } from '../components/ui/Input';
import { useRole } from '../contexts/RoleContext';
import { useToast } from '../components/ui/Toast';
import { api } from '../api/client';
import type { BusinessUnit, Manager, TicketDetailsResponse } from '../api/types';
import { useI18n } from '../contexts/I18nContext';
import { LocationMap } from '../components/LocationMap';

export function TicketDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useRole();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [selectedManager, setSelectedManager] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [ticketData, setTicketData] = useState<TicketDetailsResponse | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [officeUnit, setOfficeUnit] = useState<BusinessUnit | null>(null);
  const [officeLoading, setOfficeLoading] = useState(false);
  const [officeError, setOfficeError] = useState('');

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        const [ticketRes, managersRes] = await Promise.all([
          api.getTicket(id),
          api.listManagers(),
        ]);
        if (active) {
          setTicketData(ticketRes);
          setManagers(managersRes.items || []);
        }
      } catch (e: any) {
        if (active) setError(e?.message || t('Failed to load ticket'));
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    let active = true;
    const loadOffice = async () => {
      if (!ticketData?.ticket) return;
      const ai = ticketData.ai_analysis;
      if (!ai?.lat || !ai?.lon || (ai?.confidence ?? 0) < 0.7) {
        setOfficeUnit(null);
        return;
      }
      const officeName = ticketData.assignment?.office || '';
      if (!officeName) return;
      setOfficeLoading(true);
      setOfficeError('');
      try {
        const res = await api.listBusinessUnits({ q: officeName });
        const match = (res.items || []).find(u => (u.name || '').toUpperCase() === officeName.toUpperCase()) || (res.items || [])[0];
        if (active) setOfficeUnit(match || null);
      } catch (e: any) {
        if (active) setOfficeError(e?.message || t('Map unavailable'));
      } finally {
        if (active) setOfficeLoading(false);
      }
    };
    loadOffice();
    return () => {
      active = false;
    };
  }, [ticketData?.assignment?.office, ticketData?.ai_analysis?.lat, ticketData?.ai_analysis?.lon, ticketData?.ai_analysis?.confidence]);

  const managerMap = useMemo(() => {
    const map = new Map<string, Manager>();
    managers.forEach(m => map.set(m.id, m));
    return map;
  }, [managers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Clock className="w-16 h-16 mx-auto mb-4 text-[rgb(var(--color-muted-foreground))]" />
          <h2>{t('Loading ticket...')}</h2>
        </div>
      </div>
    );
  }

  if (error || !ticketData?.ticket) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-[rgb(var(--color-muted-foreground))]" />
          <h2>{t('Ticket not found')}</h2>
          <p className="text-[rgb(var(--color-muted-foreground))] mt-2">{error || t("The ticket you're looking for doesn't exist.")}</p>
          <Button variant="primary" className="mt-4" onClick={() => navigate('/tickets')}>
            {t('Back to tickets')}
          </Button>
        </div>
      </div>
    );
  }

  const ticket = ticketData.ticket;
  const assignment = ticketData.assignment;
  const ai = ticketData.ai_analysis;
  const statusLabel = normalizeStatus(assignment?.status);
  const assignedManager = assignment?.manager_id ? managerMap.get(assignment.manager_id) : undefined;
  const hasGeo = ai?.lat != null && ai?.lon != null && (ai?.confidence ?? 0) >= 0.7;

  const handleReassign = async () => {
    if (!selectedManager || !reassignReason) {
      showToast(t('Please select a manager and provide a reason'), 'error');
      return;
    }
    try {
      if (!id) return;
      await api.reassignTicket(id, { manager_id: selectedManager, reason: reassignReason });
      showToast(t('Ticket reassigned successfully'), 'success');
      const updated = await api.getTicket(id);
      setTicketData(updated);
      setIsReassignModalOpen(false);
      setSelectedManager('');
      setReassignReason('');
    } catch (e: any) {
      showToast(e?.message || t('Failed to reassign ticket'), 'error');
    }
  };

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

  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return 'bg-red-500 text-white';
    if (priority >= 6) return 'bg-amber-500 text-white';
    if (priority >= 4) return 'bg-blue-500 text-white';
    return 'bg-gray-400 text-white';
  };

  const sentimentLabel = normalizeSentiment(ai?.sentiment) || t('Neutral');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/tickets')}>
            <ArrowLeft className="w-4 h-4" />
            {t('Back')}
          </Button>
          <div>
            <h1 className="font-mono">{ticket.id}</h1>
            <p className="text-[rgb(var(--color-muted-foreground))] mt-1">
              {t('Created')} {new Date(ticket.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <Badge variant={getStatusVariant(statusLabel)} size="md">
          {statusLabel === 'Assigned' && <CheckCircle2 className="w-4 h-4" />}
          {statusLabel === 'Unassigned' && <Clock className="w-4 h-4" />}
          {statusLabel === 'Error' && <AlertCircle className="w-4 h-4" />}
          {t(statusLabel)}
        </Badge>
      </div>

      {/* Unassigned Warning */}
      {statusLabel === 'Unassigned' && (
        <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-200">{t('Ticket Unassigned')}</p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              {assignment?.reason_text || t('No eligible managers available matching the required criteria.')}
            </p>
          </div>
        </div>
      )}

      {/* Error State */}
      {statusLabel === 'Error' && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-900 dark:text-red-200">{t('Assignment Error')}</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              {t('Failed to process this ticket. Error code:')} <code className="font-mono bg-red-100 dark:bg-red-900 px-1 rounded">{assignment?.reason_code || 'ERROR'}</code>
            </p>
            <div className="flex gap-2 mt-3">
              <Button variant="destructive" size="sm">
                {t('View Details')}
              </Button>
              <Button variant="outline" size="sm">
                {t('Try Again')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Original Ticket */}
          <Card>
            <CardHeader title={t('Original Ticket')} description={t('Customer message')} />
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[rgb(var(--color-muted))] border border-[rgb(var(--color-border))]">
                <p className="text-sm leading-relaxed">{ticket.message}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-[rgb(var(--color-muted-foreground))]">
                <FileText className="w-4 h-4" />
                <span>{t('No attachments')}</span>
              </div>
            </div>
          </Card>

          {/* Customer Info */}
          <Card>
            <CardHeader title={t('Customer Information')} description={t('Profile details')} />
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-[rgb(var(--color-border))]">
                <span className="text-sm text-[rgb(var(--color-muted-foreground))]">{t('Segment')}</span>
                <Badge variant={ticket.segment?.toUpperCase() === 'VIP' ? 'primary' : 'secondary'}>
                  {ticket.segment}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[rgb(var(--color-border))]">
                <span className="text-sm text-[rgb(var(--color-muted-foreground))]">{t('City')}</span>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[rgb(var(--color-muted-foreground))]" />
                  <span className="text-sm font-medium">{ticket.city}</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[rgb(var(--color-border))]">
                <span className="text-sm text-[rgb(var(--color-muted-foreground))]">{t('Language')}</span>
                <Badge variant="secondary">{ai?.language || '—'}</Badge>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-[rgb(var(--color-muted-foreground))]">{t('Contact')}</span>
                <span className="text-sm">—</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* AI Analysis */}
          <Card>
            <CardHeader
              title={t('AI Analysis')}
              description={t('Automated ticket enrichment')}
              action={<Zap className="w-5 h-5 text-[rgb(var(--color-primary))]" />}
            />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-[rgb(var(--color-muted-foreground))] mb-1">{t('Type')}</p>
                  <p className="text-sm font-medium">{normalizeType(ai?.type) || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-[rgb(var(--color-muted-foreground))] mb-1">{t('Sentiment')}</p>
                  <Badge variant={getSentimentVariant(sentimentLabel)}>
                    {t(sentimentLabel)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-[rgb(var(--color-muted-foreground))] mb-1">{t('Priority')}</p>
                  <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold ${getPriorityColor(ai?.priority || 0)}`}>
                    {ai?.priority ?? '—'}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-[rgb(var(--color-muted-foreground))] mb-1">{t('Language')}</p>
                  <Badge variant="secondary">{ai?.language || '—'}</Badge>
                </div>
              </div>

              {ai?.summary && (
                <div className="pt-4 border-t border-[rgb(var(--color-border))]">
                  <p className="text-xs text-[rgb(var(--color-muted-foreground))] mb-2">{t('Summary')}</p>
                  <p className="text-sm">{ai.summary}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader
              title={t('Location')}
              description={t('Client and office positions')}
              action={<MapPin className="w-5 h-5 text-[rgb(var(--color-primary))]" />}
            />
            {hasGeo ? (
              <div className="space-y-3">
                <p className="text-xs text-[rgb(var(--color-muted-foreground))]">
                  {t('Client location derived from AI geo detection')}
                </p>
                {officeLoading && (
                  <div className="h-60 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-muted))] animate-pulse" />
                )}
                {!officeLoading && officeError && (
                  <div className="h-60 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-muted))] flex items-center justify-center text-sm text-[rgb(var(--color-muted-foreground))]">
                    {t('Map unavailable')}
                  </div>
                )}
                {!officeLoading && !officeError && officeUnit?.lat != null && officeUnit?.lon != null && (
                  <LocationMap
                    client={{
                      label: 'client',
                      lat: ai!.lat,
                      lon: ai!.lon,
                      popup: `Client location (conf=${Math.round((ai?.confidence ?? 0) * 100)}%)`,
                    }}
                    office={{
                      label: 'office',
                      lat: officeUnit.lat,
                      lon: officeUnit.lon,
                      popup: `Assigned office: ${officeUnit.name}`,
                    }}
                  />
                )}
                {!officeLoading && !officeError && (!officeUnit?.lat || !officeUnit?.lon) && (
                  <div className="h-60 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-muted))] flex items-center justify-center text-sm text-[rgb(var(--color-muted-foreground))]">
                    {t('Map unavailable')}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-[rgb(var(--color-muted-foreground))]">
                  {t('Location not detected. Fallback office routing used.')}
                </p>
                <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
                  {t('Open offices map')}
                </Button>
              </div>
            )}
          </Card>

          {/* Assignment */}
          <Card>
            <CardHeader
              title={t('Assignment')}
              description={t('Manager allocation details')}
              action={<Users className="w-5 h-5 text-[rgb(var(--color-primary))]" />}
            />
            {assignedManager ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-[rgb(var(--color-muted))] border border-[rgb(var(--color-border))]">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <User className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="font-medium">{assignedManager.name}</p>
                      <p className="text-sm text-[rgb(var(--color-muted-foreground))]">
                        {assignedManager.role}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{assignment?.office || assignedManager.office}</Badge>
                    {assignedManager.skills.map(skill => (
                      <Badge key={skill} variant="primary" size="sm">{skill}</Badge>
                    ))}
                  </div>
                </div>

                {assignment?.reasoning && (
                  <div className="pt-4 border-t border-[rgb(var(--color-border))]">
                      <div className="flex items-center gap-2 mb-3">
                        <Target className="w-4 h-4 text-[rgb(var(--color-primary))]" />
                        <p className="text-sm font-medium">{t('Assignment Reasoning')}</p>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-[rgb(var(--color-muted-foreground))] mb-1">{t('Rule Result')}</p>
                          <p className="text-sm">{assignment.reason_code || t('Assigned')}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                          <p className="text-sm font-medium text-green-900 dark:text-green-200">
                            {assignment.reason_text || t('Assignment completed')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-[rgb(var(--color-muted-foreground))]" />
                <p className="text-sm text-[rgb(var(--color-muted-foreground))]">
                  {t('No manager assigned to this ticket')}
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Actions */}
      {role === 'admin' && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">{t('Admin Actions')}</h3>
              <p className="text-sm text-[rgb(var(--color-muted-foreground))] mt-1">
                {t('Manage ticket assignment and status')}
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="primary" onClick={() => setIsReassignModalOpen(true)}>
                <UserCog className="w-4 h-4" />
                {t('Reassign')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Reassign Modal */}
      <Modal
        isOpen={isReassignModalOpen}
        onClose={() => setIsReassignModalOpen(false)}
        title={t('Reassign Ticket')}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsReassignModalOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button variant="primary" onClick={handleReassign}>
              {t('Confirm Reassignment')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-[rgb(var(--color-muted-foreground))] mb-4">
              {t('Select a new manager for ticket')} <span className="font-mono font-medium text-[rgb(var(--color-foreground))]">{ticket.id}</span>
            </p>
          </div>

          <Dropdown
            label={t('Select Manager')}
            options={managers.map(m => ({
              value: m.id,
              label: `${m.name} - ${m.office} (${m.current_load}/${Math.max(20, m.current_load + 5)})`
            }))}
            value={selectedManager}
            onChange={setSelectedManager}
            placeholder={t('Choose a manager...')}
          />

          <Textarea
            label={t('Reason for Reassignment')}
            placeholder={t('Explain why this ticket is being reassigned...')}
            value={reassignReason}
            onChange={(e) => setReassignReason(e.target.value)}
            rows={4}
          />

          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              {t('The original manager will be notified of this reassignment.')}
            </p>
          </div>
        </div>
      </Modal>
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
