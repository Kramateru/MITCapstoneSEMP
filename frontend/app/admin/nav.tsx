'use client';

import {
  BarChart3,
  FileBarChart,
  Home,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users
} from 'lucide-react';

export const adminSidebarItems = [
  { label: 'Dashboard', icon: <Home size={20} />, href: '/admin/dashboard', section: 'Overview' },
  { label: 'Analytics', icon: <BarChart3 size={20} />, href: '/admin/analytics', section: 'Overview' },
  { label: 'Reports', icon: <FileBarChart size={20} />, href: '/admin/reports', section: 'Overview' },
  { label: 'Users', icon: <Users size={20} />, href: '/admin/users', section: 'Management' },
  { label: 'Coaching', icon: <MessageSquare size={20} />, href: '/admin/coaching', section: 'Management' },
  { label: 'Certification', icon: <ShieldCheck size={20} />, href: '/admin/certification-settings', section: 'Management' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/admin/settings', section: 'Account' },
];
