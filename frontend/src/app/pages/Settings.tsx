import React from 'react';
import { Card, CardHeader } from '../components/ui/Card';

export function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1>Settings</h1>
        <p className="text-[rgb(var(--color-muted-foreground))] mt-1">
          Configure system preferences and options
        </p>
      </div>

      <Card>
        <CardHeader title="System Settings" description="General configuration" />
        <p className="text-[rgb(var(--color-muted-foreground))]">Settings page content coming soon...</p>
      </Card>
    </div>
  );
}
