import React, { useEffect, useMemo, useState } from 'react';
import { Users as UsersIcon, MapPin, Clock } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Dropdown } from '../components/ui/Dropdown';
import { ProgressBar } from '../components/ui/ProgressBar';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import type { Manager } from '../api/types';

export function Managers() {
  const [officeFilter, setOfficeFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadManagers = async () => {
      setLoading(true);
      try {
        const res = await api.listManagers();
        if (active) setManagers(res.items || []);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadManagers();
    return () => {
      active = false;
    };
  }, []);

  const filteredManagers = useMemo(() => {
    return managers.filter(manager => {
      if (officeFilter && manager.office !== officeFilter) return false;
      if (roleFilter && manager.role !== roleFilter) return false;
      if (skillFilter && !manager.skills.includes(skillFilter)) return false;
      return true;
    });
  }, [managers, officeFilter, roleFilter, skillFilter]);

  const withCapacity = useMemo(() => {
    return managers.map(m => ({
      ...m,
      capacity: Math.max(20, m.current_load + 5),
    }));
  }, [managers]);

  const loadDistribution = withCapacity.map(m => ({
    name: m.name.split(' ')[0],
    load: m.current_load,
    capacity: m.capacity,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1>Managers</h1>
        <p className="text-[rgb(var(--color-muted-foreground))] mt-1">
          View and manage support team members
        </p>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex items-center gap-4">
          <Dropdown
            options={[
              { value: '', label: 'All Offices' },
              { value: 'Astana', label: 'Astana' },
              { value: 'Almaty', label: 'Almaty' }
            ]}
            value={officeFilter}
            onChange={setOfficeFilter}
            placeholder="Filter by office"
            className="flex-1"
          />
          <Dropdown
            options={[
              { value: '', label: 'All Roles' },
              { value: 'Lead', label: 'Lead' },
              { value: 'Senior', label: 'Senior' },
              { value: 'Junior', label: 'Junior' },
              { value: 'Глав спец', label: 'Глав спец' }
            ]}
            value={roleFilter}
            onChange={setRoleFilter}
            placeholder="Filter by role"
            className="flex-1"
          />
          <Dropdown
            options={[
              { value: '', label: 'All Skills' },
              { value: 'VIP', label: 'VIP' },
              { value: 'KZ', label: 'Kazakh' },
              { value: 'RU', label: 'Russian' },
              { value: 'ENG', label: 'English' }
            ]}
            value={skillFilter}
            onChange={setSkillFilter}
            placeholder="Filter by skill"
            className="flex-1"
          />
        </div>
      </Card>

      {/* Manager Cards Grid */}
      <div className="grid grid-cols-3 gap-6">
        {loading ? (
          <Card>
            <div className="p-6 text-center">Loading managers...</div>
          </Card>
        ) : filteredManagers.length === 0 ? (
          <Card>
            <div className="p-6 text-center">No managers found</div>
          </Card>
        ) : (
          filteredManagers.map((manager) => {
            const capacity = Math.max(20, manager.current_load + 5);
            return (
              <Card key={manager.id}>
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <UsersIcon className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-[rgb(var(--color-foreground))] mb-1">
                      {manager.name}
                    </h3>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="secondary" size="sm">{manager.role}</Badge>
                      <Badge variant="success" size="sm">active</Badge>
                    </div>
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-[rgb(var(--color-muted-foreground))]">
                        <MapPin className="w-4 h-4" />
                        {manager.office}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[rgb(var(--color-muted-foreground))]">
                        <Clock className="w-4 h-4" />
                        Updated {new Date(manager.updated_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                    <div className="mb-3">
                      <div className="flex gap-1 flex-wrap">
                        {manager.skills.map((skill) => (
                          <Badge key={skill} variant="primary" size="sm">{skill}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-[rgb(var(--color-muted-foreground))]">Current Load</span>
                        <span className="text-sm font-medium">
                          {manager.current_load}/{capacity}
                        </span>
                      </div>
                      <ProgressBar
                        value={manager.current_load}
                        max={capacity}
                        variant={manager.current_load / capacity > 0.8 ? 'warning' : 'success'}
                        size="md"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Load Distribution Chart */}
      <Card>
        <CardHeader 
          title="Team Load Distribution" 
          description="Current workload across all managers" 
        />
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={loadDistribution}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
            <XAxis dataKey="name" tick={{ fill: 'rgb(var(--color-muted-foreground))' }} />
            <YAxis tick={{ fill: 'rgb(var(--color-muted-foreground))' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgb(var(--color-card))',
                border: '1px solid rgb(var(--color-border))',
                borderRadius: '8px'
              }}
            />
            <Bar dataKey="load" fill="rgb(var(--color-primary))" name="Current Load" radius={[8, 8, 0, 0]} />
            <Bar dataKey="capacity" fill="rgb(var(--color-muted))" name="Max Capacity" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
