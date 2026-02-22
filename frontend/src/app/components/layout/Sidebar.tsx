import React from 'react';
import { NavLink } from 'react-router';
import { 
  LayoutDashboard, 
  Ticket, 
  FileText, 
  Users, 
  Upload, 
  BarChart3, 
  Settings,
  Zap,
  Palette,
  MessageSquare
} from 'lucide-react';
import { useRole } from '../../contexts/RoleContext';
import { useI18n } from '../../contexts/I18nContext';

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { name: 'Dashboard', path: '/', icon: <LayoutDashboard className="w-5 h-5" /> },
  { name: 'Tickets', path: '/tickets', icon: <Ticket className="w-5 h-5" /> },
  { name: 'Managers', path: '/managers', icon: <Users className="w-5 h-5" />, adminOnly: true },
  { name: 'Import', path: '/import', icon: <Upload className="w-5 h-5" />, adminOnly: true },
  { name: 'Analytics', path: '/analytics', icon: <BarChart3 className="w-5 h-5" />, adminOnly: true },
  { name: 'Assistant', path: '/assistant', icon: <MessageSquare className="w-5 h-5" />, adminOnly: true },
];

export function Sidebar() {
  const { role } = useRole();
  const { t } = useI18n();

  const filteredNavItems = navItems.filter(item => 
    !item.adminOnly || role === 'admin'
  );

  return (
    <aside className="app-surface w-64 h-screen border-r border-[rgb(var(--color-border))] flex flex-col shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-[rgb(var(--color-border))]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-[rgb(var(--color-foreground))] tracking-tight">F.I.R.E.</h1>
            <p className="text-xs text-[rgb(var(--color-muted-foreground))]">AI Ticket System</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[rgb(var(--color-primary))] text-white shadow-[0_10px_24px_rgba(79,70,229,0.35)]'
                  : 'text-[rgb(var(--color-muted-foreground))] hover:bg-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-foreground))]'
              }`
            }
          >
            {item.icon}
            {t(item.name)}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[rgb(var(--color-border))]">
        <div className="text-xs text-[rgb(var(--color-muted-foreground))] space-y-1">
          <p>Version 1.0.0</p>
          <p>© 2026 F.I.R.E.</p>
        </div>
      </div>
    </aside>
  );
}
