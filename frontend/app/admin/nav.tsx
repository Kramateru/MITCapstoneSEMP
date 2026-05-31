'use client';

import {
    BarChart3,
    FileText,
    MessageSquare,
    Settings,
    ShieldCheck,
    UserRound,
    Users
} from 'lucide-react';

export const adminSidebarItems = [
  // Removed Overview section items
  { label: 'Users', icon: <Users size={20} />, href: '/admin/users', section: 'Operations' },
  { label: 'Coaching', icon: <MessageSquare size={20} />, href: '/admin/coaching', section: 'Operations' },
  { label: 'Analytics', icon: <BarChart3 size={20} />, href: '/admin/analytics', section: 'Insights' },
  { label: 'Reports', icon: <FileText size={20} />, href: '/admin/reports', section: 'Insights' },
  { label: 'Profile', icon: <UserRound size={20} />, href: '/admin/profile', section: 'Account' },
  { label: 'Certifications', icon: <ShieldCheck size={20} />, href: '/admin/certification-settings', section: 'Platform' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/admin/settings', section: 'Platform' },
];
