import React, { useMemo, useState } from 'react';
import { Send, Bot, User } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { useI18n } from '../contexts/I18nContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function Assistant() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: t('Ask me about tickets, managers, or assignment rules.') }
  ]);
  const [chartData, setChartData] = useState<any[] | null>(null);
  const [chartSpec, setChartSpec] = useState<any | null>(null);

  const history = useMemo(() => {
    return messages
      .filter(m => m.role !== 'assistant' || m.content !== t('Ask me about tickets, managers, or assignment rules.'))
      .map(m => ({ role: m.role, content: m.content }));
  }, [messages, t]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setLoading(true);
    setChartData(null);
    setChartSpec(null);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    try {
      const res = await api.assistantChat({ message: text, history });
      const answer = res.answer;
      // Try to parse chart spec JSON (plain or fenced)
      let parsed: any = null;
      const fencedMatch = answer.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const jsonCandidate = fencedMatch ? fencedMatch[1] : answer;
      try {
        parsed = JSON.parse(jsonCandidate);
      } catch {
        parsed = null;
      }
      if (parsed && parsed.intent === 'chart' && Array.isArray(parsed.group_by)) {
        setChartSpec(parsed);
        const dataRes = await api.analyticsQuery({
          group_by: parsed.group_by,
          filters: parsed.filters || {},
          limit: 50,
        });
        const items = dataRes.items || [];
        if (parsed.chart === 'stacked_bar' && parsed.group_by.length >= 2) {
          const [xKey, seriesKey] = parsed.group_by;
          const pivot: Record<string, any> = {};
          const seriesSet = new Set<string>();
          items.forEach((row: any) => {
            const xVal = String(row[xKey] ?? '—');
            const sVal = String(row[seriesKey] ?? '—');
            seriesSet.add(sVal);
            if (!pivot[xVal]) pivot[xVal] = { [xKey]: xVal };
            pivot[xVal][sVal] = Number(row.count || 0);
          });
          setChartData(Object.values(pivot));
          setChartSpec({ ...parsed, _series: Array.from(seriesSet) });
        } else {
          setChartData(items);
        }
        setMessages(prev => [...prev, { role: 'assistant', content: parsed.title || t('Chart generated.') }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
      }
    } catch (e: any) {
      if (e?.code === 'AI_RATE_LIMIT') {
        const retry = e?.details?.retry_after_seconds;
        showToast(retry ? `${t('Rate limited. Try again in')} ${retry}s` : t('Rate limited. Try again later.'), 'warning');
      } else {
        showToast(e?.message || t('Assistant failed'), 'error');
      }
      setMessages(prev => [...prev, { role: 'assistant', content: t('Sorry, I could not answer that right now.') }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1>{t('Assistant')}</h1>
        <p className="text-[rgb(var(--color-muted-foreground))] mt-1">
          {t('Ask questions about tickets, managers, and assignment logic.')}
        </p>
      </div>

      <Card padding={false}>
        <div className="p-6 border-b border-[rgb(var(--color-border))]">
          <CardHeader title={t('Chat')} description={t('AI assistant for system insights')} className="mb-0" />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-6 space-y-4">
          {messages.map((m, idx) => (
            <div key={idx} className={`flex items-start gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-[rgb(var(--color-muted))] flex items-center justify-center">
                  <Bot className="w-4 h-4 text-[rgb(var(--color-muted-foreground))]" />
                </div>
              )}
              <div className={`max-w-[60%] rounded-lg px-4 py-3 text-sm ${
                m.role === 'user'
                  ? 'bg-[rgb(var(--color-primary))] text-white'
                  : 'bg-[rgb(var(--color-muted))] text-[rgb(var(--color-foreground))]'
              }`}>
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-[rgb(var(--color-muted))] flex items-center justify-center">
                  <User className="w-4 h-4 text-[rgb(var(--color-muted-foreground))]" />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-[rgb(var(--color-border))] flex items-center gap-3">
          <Input
            placeholder={t('Type your question...')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            size="sm"
            className="flex-1 min-w-[520px]"
          />
          <Button variant="primary" size="sm" onClick={handleSend} disabled={loading}>
            <Send className="w-4 h-4" />
            {t('Send')}
          </Button>
        </div>
      </Card>

      {chartData && chartSpec && (
        <Card>
          <CardHeader title={chartSpec.title || t('Chart')} description={t('Generated from assistant request')} />
          <div className="h-80">
            {chartSpec.chart === 'pie' ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="count" nameKey={chartSpec.group_by[0]} cx="50%" cy="50%" outerRadius={110}>
                    {chartData.map((_: any, idx: number) => (
                      <Cell key={`cell-${idx}`} fill={['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6'][idx % 5]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : chartSpec.chart === 'stacked_bar' && chartSpec._series ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
                  <XAxis dataKey={chartSpec.group_by[0]} tick={{ fill: 'rgb(var(--color-muted-foreground))' }} />
                  <YAxis tick={{ fill: 'rgb(var(--color-muted-foreground))' }} />
                  <Tooltip />
                  {(chartSpec._series as string[]).map((series, idx) => (
                    <Bar key={series} dataKey={series} stackId="a" fill={['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6'][idx % 5]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
                  <XAxis dataKey={chartSpec.group_by[0]} tick={{ fill: 'rgb(var(--color-muted-foreground))' }} />
                  <YAxis tick={{ fill: 'rgb(var(--color-muted-foreground))' }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="rgb(var(--color-primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
