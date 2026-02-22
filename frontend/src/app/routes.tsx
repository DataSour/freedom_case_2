import { createBrowserRouter } from 'react-router';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Tickets } from './pages/Tickets';
import { TicketDetails } from './pages/TicketDetails';
import { Managers } from './pages/Managers';
import { Import } from './pages/Import';
import { Analytics } from './pages/Analytics';
import { Assistant } from './pages/Assistant';
import { Settings } from './pages/Settings';
import { DesignSystem } from './pages/DesignSystem';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: 'tickets', Component: Tickets },
      { path: 'tickets/:id', Component: TicketDetails },
      { path: 'managers', Component: Managers },
      { path: 'import', Component: Import },
      { path: 'analytics', Component: Analytics },
      { path: 'assistant', Component: Assistant },
      { path: 'settings', Component: Settings },
      { path: 'design-system', Component: DesignSystem },
    ],
  },
]);
