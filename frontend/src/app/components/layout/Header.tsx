import React, { useState } from 'react';
import { Search, Bell, User, Sun, Moon, ChevronDown } from 'lucide-react';
import { Input } from '../ui/Input';
import { useTheme } from '../../contexts/ThemeContext';
import { useRole } from '../../contexts/RoleContext';
import { Badge } from '../ui/Badge';

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { role, toggleRole } = useRole();
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header className="app-surface h-16 border-b border-[rgb(var(--color-border))] px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <Input
          placeholder="Search tickets, customers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          icon={<Search className="w-4 h-4" />}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Role Switcher */}
        <button
          onClick={toggleRole}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-muted))] transition-colors"
        >
          <span className="text-sm font-medium text-[rgb(var(--color-foreground))]">Role:</span>
          <Badge variant={role === 'admin' ? 'primary' : 'secondary'}>
            {role === 'admin' ? 'Admin' : 'Operator'}
          </Badge>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-10 h-10 rounded-lg border border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-muted))] flex items-center justify-center transition-colors"
        >
          {theme === 'light' ? (
            <Moon className="w-5 h-5 text-[rgb(var(--color-foreground))]" />
          ) : (
            <Sun className="w-5 h-5 text-[rgb(var(--color-foreground))]" />
          )}
        </button>

        {/* Notifications */}
        <button className="relative w-10 h-10 rounded-lg border border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-muted))] flex items-center justify-center transition-colors">
          <Bell className="w-5 h-5 text-[rgb(var(--color-foreground))]" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-[rgb(var(--color-error))] rounded-full"></span>
        </button>

        {/* User Menu */}
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-muted))] transition-colors">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-medium text-[rgb(var(--color-foreground))]">Admin</span>
          <ChevronDown className="w-4 h-4 text-[rgb(var(--color-muted-foreground))]" />
        </button>
      </div>
    </header>
  );
}
