import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'positive' | 'neutral' | 'negative' | 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ children, variant = 'default', size = 'md', className = '' }: BadgeProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap';
  
  const variants = {
    default: 'bg-[rgb(var(--color-muted))] text-[rgb(var(--color-muted-foreground))]',
    positive: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
    neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    negative: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    primary: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400',
    secondary: 'bg-[rgb(var(--color-secondary))] text-[rgb(var(--color-secondary-foreground))]',
    success: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
  };
  
  const sizes = {
    sm: 'h-5 px-2 text-xs',
    md: 'h-6 px-2.5 text-xs'
  };
  
  return (
    <span className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
}
