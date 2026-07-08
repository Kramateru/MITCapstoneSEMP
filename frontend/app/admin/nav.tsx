'use client';

import { LazyIcon } from '@/app/components/ui/LazyIcon';

export const adminSidebarItems = [
  // Removed Overview section items
  { label: 'Users', icon: <LazyIcon name="Users" size={20} />, href: '/admin/users', section: 'Operations' },
  { label: 'Coaching', icon: <LazyIcon name="MessageSquare" size={20} />, href: '/admin/coaching', section: 'Operations' },
  { label: 'Audit Trail', icon: <LazyIcon name="ClipboardList" size={20} />, href: '/admin/audit-trail', section: 'Operations' },
  { label: 'Analytics', icon: <LazyIcon name="BarChart3" size={20} />, href: '/admin/analytics', section: 'Insights' },
  { label: 'Reports', icon: <LazyIcon name="FileText" size={20} />, href: '/admin/reports', section: 'Insights' },
  { label: 'Profile', icon: <LazyIcon name="UserRound" size={20} />, href: '/admin/profile', section: 'Account' },
  { label: 'Certifications', icon: <LazyIcon name="ShieldCheck" size={20} />, href: '/admin/certification-settings', section: 'Platform' },
  { label: 'Settings', icon: <LazyIcon name="Settings" size={20} />, href: '/admin/settings', section: 'Platform' },
];
