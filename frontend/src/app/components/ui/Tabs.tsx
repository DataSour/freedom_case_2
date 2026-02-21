import React from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className = '' }: TabsProps) {
  return (
    <div className={`border-b border-[rgb(var(--color-border))] ${className}`}>
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-all flex items-center gap-2 border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-[rgb(var(--color-primary))] text-[rgb(var(--color-primary))]'
                : 'border-transparent text-[rgb(var(--color-muted-foreground))] hover:text-[rgb(var(--color-foreground))]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
