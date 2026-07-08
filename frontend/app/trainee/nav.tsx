'use client';

import { LazyIcon } from '@/app/components/ui/LazyIcon';

export const traineeSidebarItems = [
  { label: 'Dashboard', icon: <LazyIcon name="Home" size={20} />, href: '/trainee/dashboard', section: 'Workspace' },
  { label: 'Modules', icon: <LazyIcon name="BookOpen" size={20} />, href: '/trainee/microlearning', section: 'Learning' },
  { label: 'Assessments', icon: <LazyIcon name="ClipboardList" size={20} />, href: '/trainee/assessment', section: 'Learning' },
  { label: 'Simulations', icon: <LazyIcon name="Mic" size={20} />, href: '/trainee/call-simulation', section: 'Learning' },
  { label: 'Coaching', icon: <LazyIcon name="MessageSquare" size={20} />, href: '/trainee/coaching', section: 'Learning' },
  { label: 'Progress', icon: <LazyIcon name="LineChart" size={20} />, href: '/trainee/progress', section: 'Performance' },
  { label: 'Certificates', icon: <LazyIcon name="Award" size={20} />, href: '/trainee/certificates', section: 'Performance' },
  { label: 'Profile', icon: <LazyIcon name="UserRound" size={20} />, href: '/trainee/profile', section: 'Account' },
  { label: 'Settings', icon: <LazyIcon name="Settings" size={20} />, href: '/trainee/settings', section: 'Account' },
];
