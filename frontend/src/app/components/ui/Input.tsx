import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({ label, error, icon, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-[rgb(var(--color-foreground))]">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--color-muted-foreground))]">
            {icon}
          </div>
        )}
        <input
          className={`w-full h-10 px-3 ${icon ? 'pl-10' : ''} rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-foreground))] placeholder:text-[rgb(var(--color-muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-ring))] focus:border-transparent transition-all ${className}`}
          {...props}
        />
      </div>
      {error && (
        <p className="text-sm text-[rgb(var(--color-error))]">{error}</p>
      )}
    </div>
  );
}

export function Textarea({ label, error, className = '', ...props }: InputProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-[rgb(var(--color-foreground))]">
          {label}
        </label>
      )}
      <textarea
        className={`w-full px-3 py-2 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-foreground))] placeholder:text-[rgb(var(--color-muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-ring))] focus:border-transparent transition-all resize-none ${className}`}
        {...props}
      />
      {error && (
        <p className="text-sm text-[rgb(var(--color-error))]">{error}</p>
      )}
    </div>
  );
}
