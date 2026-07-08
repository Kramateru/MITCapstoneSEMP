'use client';

import { LazyIcon } from '@/app/components/ui/LazyIcon';

export const trainerSidebarItems = (pendingReviews?: number) => [
  // Removed Overview section items
  { label: 'Trainees', icon: <LazyIcon name="Users" size={20} />, href: '/trainer/users', section: 'Workspace' },
  { label: 'Batches', icon: <LazyIcon name="Users" size={20} />, href: '/trainer/batches', section: 'Workspace' },
  { label: 'Learning', icon: <LazyIcon name="BookOpen" size={20} />, href: '/trainer/microlearning', section: 'Workspace' },
  { label: 'Assessments', icon: <LazyIcon name="ClipboardList" size={20} />, href: '/trainer/assessments', section: 'Workspace' },
  { label: 'Simulations', icon: <LazyIcon name="Mic" size={20} />, href: '/trainer/call-simulation', section: 'Workspace' },
  { label: 'Coaching', icon: <LazyIcon name="FileText" size={20} />, href: '/trainer/coaching', badge: pendingReviews, section: 'Workspace' },
  { label: 'Analytics', icon: <LazyIcon name="BarChart3" size={20} />, href: '/trainer/analytics', section: 'Insights' },
  { label: 'Reports', icon: <LazyIcon name="ClipboardList" size={20} />, href: '/trainer/reports', section: 'Insights' },
  { label: 'Profile', icon: <LazyIcon name="UserRound" size={20} />, href: '/trainer/profile', section: 'Account' },
  { label: 'Settings', icon: <LazyIcon name="Settings" size={20} />, href: '/trainer/settings', section: 'Account' },
];
