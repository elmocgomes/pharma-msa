import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Smartphone,
  MessageSquare,
  Megaphone,
  Pill,
  Building2,
  Activity,
  FileText,
} from 'lucide-react';

const navigation = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Sessions', href: '/sessions', icon: Smartphone },
  { name: 'Campaigns', href: '/campaigns', icon: Megaphone },
  { name: 'Conversations', href: '/conversations', icon: MessageSquare },
  { name: 'Pharmacies', href: '/pharmacies', icon: Building2 },
  { name: 'Products', href: '/products', icon: Pill },
  { name: 'Prompts', href: '/prompts', icon: FileText },
];

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col bg-sidebar">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2.5 px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-text-inverse tracking-tight">Pharma MSA</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {navigation.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-active text-text-inverse'
                  : 'text-gray-400 hover:bg-sidebar-hover hover:text-gray-200',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/5 px-5 py-3">
          <p className="text-[11px] text-gray-500">Mystery Shopper Automation</p>
          <p className="text-[10px] text-gray-600 mt-0.5">v2.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
