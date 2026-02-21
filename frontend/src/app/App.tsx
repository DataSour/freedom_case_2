import React from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { ThemeProvider } from './contexts/ThemeContext';
import { RoleProvider } from './contexts/RoleContext';
import { ToastProvider } from './components/ui/Toast';

export default function App() {
  return (
    <ThemeProvider>
      <RoleProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </RoleProvider>
    </ThemeProvider>
  );
}
