import React from 'react';

interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: 'default' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
}

export function ProgressBar({ 
  value, 
  max = 100, 
  variant = 'default', 
  size = 'md',
  showLabel = false,
  label
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  const variants = {
    default: 'bg-[rgb(var(--color-primary))]',
    success: 'bg-[rgb(var(--color-success))]',
    warning: 'bg-[rgb(var(--color-warning))]',
    error: 'bg-[rgb(var(--color-error))]'
  };
  
  const sizes = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };
  
  return (
    <div>
      {(showLabel || label) && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-[rgb(var(--color-foreground))]">{label}</span>
          <span className="text-sm font-medium text-[rgb(var(--color-muted-foreground))]">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
      <div className={`w-full bg-[rgb(var(--color-muted))] rounded-full overflow-hidden ${sizes[size]}`}>
        <div
          className={`${sizes[size]} ${variants[variant]} rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
