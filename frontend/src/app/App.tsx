import React from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { ThemeProvider } from './contexts/ThemeContext';
import { RoleProvider } from './contexts/RoleContext';
import { I18nProvider } from './contexts/I18nContext';
import { ToastProvider } from './components/ui/Toast';

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <RoleProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </RoleProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
