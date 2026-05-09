'use client';

import {
  ClipboardList,
  BarChart3,
  FileBarChart,
  Home,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users
} from 'lucide-react';

export const adminSidebarItems = [
  { label: 'Dashboard', icon: <Home size={20} />, href: '/admin/dashboard' },
  { label: 'Users', icon: <Users size={20} />, href: '/admin/users' },
  { label: 'Assessments', icon: <ClipboardList size={20} />, href: '/admin/assessment' },
  { label: 'Coaching', icon: <MessageSquare size={20} />, href: '/admin/coaching' },
  { label: 'Certification', icon: <ShieldCheck size={20} />, href: '/admin/certification-settings' },
  { label: 'Analytics', icon: <BarChart3 size={20} />, href: '/admin/analytics' },
  { label: 'Reports', icon: <FileBarChart size={20} />, href: '/admin/reports' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/admin/settings' },
];
