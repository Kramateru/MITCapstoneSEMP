'use client';

import {
  Home,
  FileText,
  Users,
  BarChart3,
  Settings,
  MessageSquare,
  Building2,
  ShieldCheck,
} from 'lucide-react';

export const adminSidebarItems = [
  { label: 'Dashboard', icon: <Home size={20} />, href: '/admin/dashboard' },
  { label: 'Configuration', icon: <Settings size={20} />, href: '/admin/configuration' },
  { label: 'Scenarios', icon: <FileText size={20} />, href: '/admin/scenarios' },
  { label: 'Certificate Settings', icon: <ShieldCheck size={20} />, href: '/admin/certification-settings' },
  { label: 'Users', icon: <Users size={20} />, href: '/admin/users' },
  { label: 'LOB', icon: <Building2 size={20} />, href: '/admin/lob' },
  { label: 'Coaching', icon: <MessageSquare size={20} />, href: '/admin/coaching' },
  { label: 'Analytics', icon: <BarChart3 size={20} />, href: '/admin/analytics' },
];
