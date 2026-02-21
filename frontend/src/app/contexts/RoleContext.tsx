import React, { createContext, useContext, useState } from 'react';

type Role = 'operator' | 'admin';

interface RoleContextType {
  role: Role;
  setRole: (role: Role) => void;
  toggleRole: () => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>('operator');

  const toggleRole = () => {
    setRoleState(prev => prev === 'operator' ? 'admin' : 'operator');
  };

  const setRole = (newRole: Role) => {
    setRoleState(newRole);
  };

  return (
    <RoleContext.Provider value={{ role, setRole, toggleRole }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within RoleProvider');
  }
  return context;
}
