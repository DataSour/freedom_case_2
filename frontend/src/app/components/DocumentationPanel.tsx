import React from 'react';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Info, Zap, Users, BarChart3, Shield } from 'lucide-react';

export function DocumentationPanel() {
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-2">F.I.R.E. System</h2>
            <p className="text-[rgb(var(--color-muted-foreground))]">
              AI-powered ticket enrichment and automatic manager assignment platform
            </p>
            <div className="flex gap-2 mt-3">
              <Badge variant="primary">AI-Powered</Badge>
              <Badge variant="success">Production Ready</Badge>
              <Badge variant="secondary">Demo</Badge>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-[rgb(var(--color-primary))] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium mb-1">About F.I.R.E.</h3>
              <p className="text-sm text-[rgb(var(--color-muted-foreground))]">
                F.I.R.E. (Fast Intelligent Routing Engine) automatically processes customer support tickets, 
                enriches them with AI analysis, and assigns them to the most appropriate manager based on 
                complex business rules, skills, and workload balancing.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Zap className="w-5 h-5 text-[rgb(var(--color-primary))] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium mb-1">Key Features</h3>
              <ul className="text-sm text-[rgb(var(--color-muted-foreground))] space-y-1 ml-5 list-disc">
                <li>AI-powered sentiment analysis and ticket classification</li>
                <li>Automatic priority scoring (1-10 scale)</li>
                <li>Geographic location detection with confidence scoring</li>
                <li>Multi-language support (Kazakh, Russian, English)</li>
                <li>Smart manager assignment with explainability</li>
                <li>Fair workload distribution across teams</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-3">
            <Users className="w-5 h-5 text-[rgb(var(--color-primary))] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium mb-1">Assignment Logic</h3>
              <p className="text-sm text-[rgb(var(--color-muted-foreground))] mb-2">
                The system uses a multi-stage assignment algorithm:
              </p>
              <ol className="text-sm text-[rgb(var(--color-muted-foreground))] space-y-1 ml-5 list-decimal">
                <li><strong>Office Selection:</strong> Route to customer's local office (Astana/Almaty)</li>
                <li><strong>Hard Rules:</strong> Apply VIP, language, and role requirements</li>
                <li><strong>Candidate Filtering:</strong> Find all eligible managers</li>
                <li><strong>Load Balancing:</strong> Select least-loaded qualified manager</li>
                <li><strong>Round Robin:</strong> Tie-breaking for equal loads</li>
              </ol>
            </div>
          </div>

          <div className="flex gap-3">
            <BarChart3 className="w-5 h-5 text-[rgb(var(--color-primary))] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium mb-1">Demo Flow</h3>
              <ol className="text-sm text-[rgb(var(--color-muted-foreground))] space-y-1 ml-5 list-decimal">
                <li><strong>Dashboard:</strong> View real-time KPIs and system health</li>
                <li><strong>Import:</strong> Upload CSV files and run processing pipeline</li>
                <li><strong>AI Analysis:</strong> Automatic sentiment, priority, and geo detection</li>
                <li><strong>Assignment:</strong> Smart routing with full explainability</li>
                <li><strong>Tickets:</strong> Browse and filter all processed tickets</li>
                <li><strong>Ticket Details:</strong> See complete AI reasoning and assignment logic</li>
                <li><strong>Analytics:</strong> Track fairness metrics and performance</li>
              </ol>
            </div>
          </div>

          <div className="flex gap-3">
            <Shield className="w-5 h-5 text-[rgb(var(--color-primary))] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium mb-1">User Roles</h3>
              <div className="space-y-2 text-sm text-[rgb(var(--color-muted-foreground))]">
                <div>
                  <Badge variant="secondary" size="sm">Operator</Badge>
                  <span className="ml-2">View tickets and ticket details</span>
                </div>
                <div>
                  <Badge variant="primary" size="sm">Admin</Badge>
                  <span className="ml-2">Full access: Import, Managers, Analytics, Reassignment</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-medium mb-3">Design System Highlights</h3>
        <ul className="text-sm text-[rgb(var(--color-muted-foreground))] space-y-2">
          <li>✓ <strong>Premium fintech aesthetic</strong> inspired by Stripe, Linear, and Notion</li>
          <li>✓ <strong>Inter font</strong> with optimized typography scale</li>
          <li>✓ <strong>8px spacing grid</strong> for consistent layouts</li>
          <li>✓ <strong>16-20px rounded corners</strong> for modern feel</li>
          <li>✓ <strong>Light & Dark themes</strong> with semantic color system</li>
          <li>✓ <strong>Comprehensive component library</strong> with consistent variants</li>
          <li>✓ <strong>Accessible</strong> with proper contrast and keyboard navigation</li>
        </ul>
      </Card>
    </div>
  );
}
