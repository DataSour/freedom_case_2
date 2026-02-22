import React, { useRef, useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Play, Clock, Database } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useToast } from '../components/ui/Toast';
import { api } from '../api/client';
import type { ImportSummary, RunSummary } from '../api/types';
import { useI18n } from '../contexts/I18nContext';

type FileStatus = 'idle' | 'uploaded' | 'validated' | 'error';

type ProcessingStep = 'parse' | 'enrich' | 'assign' | 'save' | 'done';

interface FileUpload {
  name: string;
  status: FileStatus;
  size?: string;
  rows?: number;
  error?: string;
  file?: File | null;
}

export function Import() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<ProcessingStep | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [logs, setLogs] = useState<Array<{ time: string; type: 'info' | 'success' | 'warning' | 'error'; message: string }>>([]);

  const [files, setFiles] = useState<{
    tickets: FileUpload;
    managers: FileUpload;
    businessUnits: FileUpload;
  }>({
    tickets: { name: 'tickets.csv', status: 'idle' },
    managers: { name: 'managers.csv', status: 'idle' },
    businessUnits: { name: 'business_units.csv', status: 'idle' }
  });

  const [summary, setSummary] = useState<{
    processed: number;
    assigned: number;
    assignedLocal: number;
    assignedCrossOffice: number;
    unassigned: number;
    unassignedGlobal: number;
    errors: number;
    topUnassignedReasons: Record<string, number>;
  } | null>(null);

  const ticketsInputRef = useRef<HTMLInputElement>(null);
  const managersInputRef = useRef<HTMLInputElement>(null);
  const unitsInputRef = useRef<HTMLInputElement>(null);

  const steps: Array<{ id: ProcessingStep; label: string }> = [
    { id: 'parse', label: t('Parse CSV Files') },
    { id: 'enrich', label: t('AI Enrichment') },
    { id: 'assign', label: t('Auto Assignment') },
    { id: 'save', label: t('Save to Database') },
    { id: 'done', label: t('Complete') }
  ];

  const addLog = (type: 'info' | 'success' | 'warning' | 'error', message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { time, type, message }]);
  };

  const handleFileChange = (key: 'tickets' | 'managers' | 'businessUnits', file?: File | null) => {
    if (!file) return;
    setFiles(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        file,
        status: 'uploaded',
        size: formatBytes(file.size),
        error: undefined,
      }
    }));
  };

  const handleImport = async () => {
    const ticketsFile = files.tickets.file;
    const managersFile = files.managers.file;
    const unitsFile = files.businessUnits.file;
    if (!ticketsFile || !managersFile || !unitsFile) {
      showToast(t('Please select all three CSV files'), 'error');
      return;
    }

    try {
      setLogs([]);
      addLog('info', t('Uploading CSV files...'));
      const result: ImportSummary = await api.importCSV({
        tickets: ticketsFile,
        managers: managersFile,
        business_units: unitsFile,
      });
      addLog('success', `${t('Parsed tickets.csv:')} ${result.tickets.parsed} ${t('rows')}`);
      addLog('success', `${t('Parsed managers.csv:')} ${result.managers.parsed} ${t('rows')}`);
      addLog('success', `${t('Parsed business_units.csv:')} ${result.business_units.parsed} ${t('rows')}`);
      addLog('success', t('Import completed'));
      setFiles(prev => ({
        tickets: { ...prev.tickets, status: 'validated', rows: result.tickets.inserted },
        managers: { ...prev.managers, status: 'validated', rows: result.managers.inserted },
        businessUnits: { ...prev.businessUnits, status: 'validated', rows: result.business_units.inserted },
      }));
      showToast(t('Import completed'), 'success');
    } catch (e: any) {
      addLog('error', e?.message || t('Import failed'));
      showToast(e?.message || t('Import failed'), 'error');
    }
  };

  const handleRunProcessing = async () => {
    setIsProcessing(true);
    setProcessingStep('parse');
    setProcessingProgress(10);
    setLogs([]);
    setSummary(null);

    addLog('info', t('Starting processing pipeline...'));

    try {
      const hasFiles =
        files.tickets.file && files.managers.file && files.businessUnits.file;
      const needsImport =
        hasFiles &&
        (files.tickets.status !== 'validated' ||
          files.managers.status !== 'validated' ||
          files.businessUnits.status !== 'validated');

      if (needsImport) {
        addLog('info', 'Importing CSV files before processing...');
        const result: ImportSummary = await api.importCSV({
          tickets: files.tickets.file!,
          managers: files.managers.file!,
          business_units: files.businessUnits.file!,
        });
        addLog('success', `Parsed tickets.csv: ${result.tickets.parsed} rows`);
        addLog('success', `Parsed managers.csv: ${result.managers.parsed} rows`);
        addLog('success', `Parsed business_units.csv: ${result.business_units.parsed} rows`);
        setFiles(prev => ({
          tickets: { ...prev.tickets, status: 'validated', rows: result.tickets.inserted },
          managers: { ...prev.managers, status: 'validated', rows: result.managers.inserted },
          businessUnits: { ...prev.businessUnits, status: 'validated', rows: result.business_units.inserted },
        }));
        setProcessingProgress(30);
      }

      const result: RunSummary = await api.processTickets();
      const events = result.events || [];
      const counts = result.counts || {};

      events.forEach((event: any) => {
        if (event.type === 'ai_enrichment') {
          addLog('success', `AI enrichment complete: ${event.count} tickets`);
          setProcessingStep('enrich');
          setProcessingProgress(55);
        } else if (event.type === 'assignment') {
          const local = event.assigned_local ?? 0;
          const cross = event.assigned_cross_office ?? 0;
          addLog('success', `Assigned: ${event.assigned} (local ${local}, cross ${cross}), Unassigned: ${event.unassigned}`);
          setProcessingStep('assign');
          setProcessingProgress(75);
        } else if (event.type === 'db_save') {
          addLog('success', 'Saved processing results to DB');
          setProcessingStep('save');
          setProcessingProgress(90);
        } else if (event.type === 'office_selection') {
          addLog('info', `Office selection: geo=${event.geo_coverage}, fallback=${event.fallback_count}`);
        }
      });

      setSummary({
        processed: counts.tickets_processed || 0,
        assigned: counts.assigned || 0,
        assignedLocal: counts.assigned_local_count || 0,
        assignedCrossOffice: counts.assigned_cross_office_count || 0,
        unassigned: counts.unassigned || 0,
        unassignedGlobal: counts.unassigned_global_count || 0,
        errors: counts.ai_errors || 0,
        topUnassignedReasons: counts.top_unassigned_reasons || {},
      });
      addLog('success', 'Processing completed successfully');
      setProcessingStep('done');
      setProcessingProgress(100);
      showToast('Processing completed successfully', 'success');
    } catch (e: any) {
      addLog('error', e?.message || 'Processing failed');
      showToast(e?.message || 'Processing failed', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStepStatus = (stepId: ProcessingStep) => {
    if (!processingStep) return 'idle';
    const currentIndex = steps.findIndex(s => s.id === processingStep);
    const stepIndex = steps.findIndex(s => s.id === stepId);
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'idle';
  };

  const getFileStatusIcon = (status: FileStatus) => {
    if (status === 'validated') return <CheckCircle2 className="w-5 h-5 text-[rgb(var(--color-success))]" />;
    if (status === 'uploaded') return <FileText className="w-5 h-5 text-[rgb(var(--color-primary))]" />;
    if (status === 'error') return <AlertCircle className="w-5 h-5 text-[rgb(var(--color-error))]" />;
    return <Upload className="w-5 h-5 text-[rgb(var(--color-muted-foreground))]" />;
  };

  const getFileStatusBadge = (status: FileStatus) => {
    if (status === 'validated') return <Badge variant="success">{t('Validated')}</Badge>;
    if (status === 'uploaded') return <Badge variant="primary">{t('Uploaded')}</Badge>;
    if (status === 'error') return <Badge variant="error">{t('Error')}</Badge>;
    return <Badge variant="secondary">{t('Idle')}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1>{t('Import & Processing')}</h1>
          <p className="text-[rgb(var(--color-muted-foreground))] mt-1">
            {t('Upload CSV files and run automated ticket processing')}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="lg" onClick={handleImport}>
            <Upload className="w-5 h-5" />
            {t('Import CSVs')}
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={handleRunProcessing}
            disabled={isProcessing}
            loading={isProcessing}
          >
            <Play className="w-5 h-5" />
            {t('Run Processing')}
          </Button>
        </div>
      </div>

      {/* File Upload Cards */}
      <div className="grid grid-cols-3 gap-6">
        <Card>
          <div className="flex items-start gap-4">
            {getFileStatusIcon(files.tickets.status)}
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-[rgb(var(--color-foreground))]">{files.tickets.name}</h3>
                  {files.tickets.size && (
                    <p className="text-sm text-[rgb(var(--color-muted-foreground))] mt-1">
                      {files.tickets.size} {files.tickets.rows ? `• ${files.tickets.rows} ${t('rows')}` : ''}
                    </p>
                  )}
                </div>
                {getFileStatusBadge(files.tickets.status)}
              </div>
              {files.tickets.error && (
                <p className="text-sm text-[rgb(var(--color-error))] mt-2">{files.tickets.error}</p>
              )}
              <div className="mt-4">
                <input ref={ticketsInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFileChange('tickets', e.target.files?.[0] || null)} />
                <Button variant="outline" size="sm" className="w-full" onClick={() => ticketsInputRef.current?.click()}>
                  <Upload className="w-4 h-4" />
                  {t('Select File')}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-4">
            {getFileStatusIcon(files.managers.status)}
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-[rgb(var(--color-foreground))]">{files.managers.name}</h3>
                  {files.managers.size && (
                    <p className="text-sm text-[rgb(var(--color-muted-foreground))] mt-1">
                      {files.managers.size} {files.managers.rows ? `• ${files.managers.rows} ${t('rows')}` : ''}
                    </p>
                  )}
                </div>
                {getFileStatusBadge(files.managers.status)}
              </div>
              {files.managers.error && (
                <p className="text-sm text-[rgb(var(--color-error))] mt-2">{files.managers.error}</p>
              )}
              <div className="mt-4">
                <input ref={managersInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFileChange('managers', e.target.files?.[0] || null)} />
                <Button variant="outline" size="sm" className="w-full" onClick={() => managersInputRef.current?.click()}>
                  <Upload className="w-4 h-4" />
                  {t('Select File')}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-4">
            {getFileStatusIcon(files.businessUnits.status)}
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-[rgb(var(--color-foreground))]">{files.businessUnits.name}</h3>
                  {files.businessUnits.size && (
                    <p className="text-sm text-[rgb(var(--color-muted-foreground))] mt-1">
                      {files.businessUnits.size} {files.businessUnits.rows ? `• ${files.businessUnits.rows} ${t('rows')}` : ''}
                    </p>
                  )}
                </div>
                {getFileStatusBadge(files.businessUnits.status)}
              </div>
              {files.businessUnits.error && (
                <p className="text-sm text-[rgb(var(--color-error))] mt-2">{files.businessUnits.error}</p>
              )}
              <div className="mt-4">
                <input ref={unitsInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFileChange('businessUnits', e.target.files?.[0] || null)} />
                <Button variant="outline" size="sm" className="w-full" onClick={() => unitsInputRef.current?.click()}>
                  <Upload className="w-4 h-4" />
                  {t('Select File')}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Processing Stepper */}
      {(isProcessing || processingStep) && (
        <Card>
          <CardHeader title={t('Processing Pipeline')} description={t('Automated ticket processing workflow')} />
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => {
                const status = getStepStatus(step.id);
                return (
                  <React.Fragment key={step.id}>
                    <div className="flex flex-col items-center gap-2">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                        status === 'complete' ? 'bg-[rgb(var(--color-success))] text-white' :
                        status === 'active' ? 'bg-[rgb(var(--color-primary))] text-white animate-pulse' :
                        'bg-[rgb(var(--color-muted))] text-[rgb(var(--color-muted-foreground))]'
                      }`}>
                        {status === 'complete' ? (
                          <CheckCircle2 className="w-6 h-6" />
                        ) : status === 'active' ? (
                          <Clock className="w-6 h-6" />
                        ) : (
                          <span className="font-medium">{index + 1}</span>
                        )}
                      </div>
                      <span className={`text-sm font-medium ${
                        status === 'active' ? 'text-[rgb(var(--color-foreground))]' : 'text-[rgb(var(--color-muted-foreground))]'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                    {index < steps.length - 1 && (
                      <div className={`flex-1 h-1 rounded-full transition-all ${
                        status === 'complete' ? 'bg-[rgb(var(--color-success))]' : 'bg-[rgb(var(--color-muted))]'
                      }`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <ProgressBar value={processingProgress} variant="default" size="md" />
          </div>
        </Card>
      )}

      {/* Processing Logs */}
      {logs.length > 0 && (
        <Card>
          <CardHeader title={t('Processing Log')} description={t('Real-time event stream')} />
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.map((log, index) => {
              const icons = {
                info: <FileText className="w-4 h-4 text-blue-500" />,
                success: <CheckCircle2 className="w-4 h-4 text-[rgb(var(--color-success))]" />,
                warning: <AlertCircle className="w-4 h-4 text-[rgb(var(--color-warning))]" />,
                error: <AlertCircle className="w-4 h-4 text-[rgb(var(--color-error))]" />
              };

              return (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg bg-[rgb(var(--color-muted))] border border-[rgb(var(--color-border))]"
                >
                  {icons[log.type]}
                  <div className="flex-1">
                    <p className="text-sm">{log.message}</p>
                  </div>
                  <span className="text-xs text-[rgb(var(--color-muted-foreground))] font-mono">
                    {log.time}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Summary */}
      {summary && (
        <Card>
          <CardHeader title={t('Processing Summary')} description={t('Final results')} />
          <div className="grid grid-cols-4 gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Database className="w-5 h-5 text-[rgb(var(--color-primary))]" />
                <span className="text-sm text-[rgb(var(--color-muted-foreground))]">{t('Total Processed')}</span>
              </div>
              <p className="text-3xl font-bold">{summary.processed}</p>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle2 className="w-5 h-5 text-[rgb(var(--color-success))]" />
                <span className="text-sm text-[rgb(var(--color-muted-foreground))]">{t('Assigned')}</span>
              </div>
              <p className="text-3xl font-bold text-[rgb(var(--color-success))]">{summary.assigned}</p>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-5 h-5 text-[rgb(var(--color-warning))]" />
                <span className="text-sm text-[rgb(var(--color-muted-foreground))]">{t('Unassigned')}</span>
              </div>
              <p className="text-3xl font-bold text-[rgb(var(--color-warning))]">{summary.unassigned}</p>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <AlertCircle className="w-5 h-5 text-[rgb(var(--color-error))]" />
                <span className="text-sm text-[rgb(var(--color-muted-foreground))]">{t('Errors')}</span>
              </div>
              <p className="text-3xl font-bold text-[rgb(var(--color-error))]">{summary.errors}</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-6">
            <div className="p-4 rounded-lg bg-[rgb(var(--color-muted))] border border-[rgb(var(--color-border))]">
              <p className="text-xs text-[rgb(var(--color-muted-foreground))]">{t('Assigned Local')}</p>
              <p className="text-2xl font-semibold text-[rgb(var(--color-success))]">{summary.assignedLocal}</p>
            </div>
            <div className="p-4 rounded-lg bg-[rgb(var(--color-muted))] border border-[rgb(var(--color-border))]">
              <p className="text-xs text-[rgb(var(--color-muted-foreground))]">{t('Assigned Cross-Office')}</p>
              <p className="text-2xl font-semibold text-[rgb(var(--color-success))]">{summary.assignedCrossOffice}</p>
            </div>
            <div className="p-4 rounded-lg bg-[rgb(var(--color-muted))] border border-[rgb(var(--color-border))]">
              <p className="text-xs text-[rgb(var(--color-muted-foreground))]">{t('Unassigned Global')}</p>
              <p className="text-2xl font-semibold text-[rgb(var(--color-warning))]">{summary.unassignedGlobal}</p>
            </div>
          </div>
          <div className="mt-6">
            <p className="text-sm text-[rgb(var(--color-muted-foreground))] mb-3">{t('Top Unassigned Reasons')}</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(summary.topUnassignedReasons || {}).length === 0 ? (
                <span className="text-xs text-[rgb(var(--color-muted-foreground))]">{t('No data')}</span>
              ) : (
                Object.entries(summary.topUnassignedReasons).map(([reason, count]) => (
                  <span
                    key={reason}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border border-[rgb(var(--color-border))] bg-[rgb(var(--color-muted))]"
                  >
                    <span className="font-medium">{reason}</span>
                    <span className="text-[rgb(var(--color-muted-foreground))]">{count}</span>
                  </span>
                ))
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
