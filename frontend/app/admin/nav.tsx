'use client';

import {
    MessageSquare,
    Settings,
    ShieldCheck,
    Users
} from 'lucide-react';

export const adminSidebarItems = [
  // Removed Overview section items
  { label: 'Users', icon: <Users size={20} />, href: '/admin/users', section: 'Operations' },
  { label: 'Coaching', icon: <MessageSquare size={20} />, href: '/admin/coaching', section: 'Operations' },
  { label: 'Certifications', icon: <ShieldCheck size={20} />, href: '/admin/certification-settings', section: 'Platform' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/admin/settings', section: 'Platform' },
];
