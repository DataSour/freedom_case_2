import React, { useState } from 'react';
import { Search, User, Sun, Moon, ChevronDown } from 'lucide-react';
import { Input } from '../ui/Input';
import { useTheme } from '../../contexts/ThemeContext';
import { useRole } from '../../contexts/RoleContext';
import { useI18n } from '../../contexts/I18nContext';
import { Badge } from '../ui/Badge';

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { role, toggleRole } = useRole();
  const { lang, toggleLang, t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header className="app-surface h-14 border-b border-[rgb(var(--color-border))] px-5 flex items-center justify-between sticky top-0 z-20">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <Input
          placeholder={t('Search tickets, customers...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          icon={<Search className="w-3.5 h-3.5" />}
          size="sm"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Role Switcher */}
        <button
          onClick={toggleRole}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-muted))] transition-colors"
        >
          <span className="text-sm font-medium text-[rgb(var(--color-foreground))]">{t('Role:')}</span>
          <Badge variant={role === 'admin' ? 'primary' : 'secondary'}>
            {role === 'admin' ? t('Admin') : t('Operator')}
          </Badge>
        </button>

        <button
          onClick={toggleLang}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-muted))] transition-colors"
        >
          <span className="text-sm font-medium text-[rgb(var(--color-foreground))]">Lang</span>
          <Badge variant="secondary">
            {lang.toUpperCase()}
          </Badge>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-md border border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-muted))] flex items-center justify-center transition-colors"
        >
          {theme === 'light' ? (
            <Moon className="w-5 h-5 text-[rgb(var(--color-foreground))]" />
          ) : (
            <Sun className="w-5 h-5 text-[rgb(var(--color-foreground))]" />
          )}
        </button>

        {/* User Menu */}
        <button className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-muted))] transition-colors">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-medium text-[rgb(var(--color-foreground))]">{t('Admin')}</span>
          <ChevronDown className="w-4 h-4 text-[rgb(var(--color-muted-foreground))]" />
        </button>
      </div>
    </header>
  );
}
