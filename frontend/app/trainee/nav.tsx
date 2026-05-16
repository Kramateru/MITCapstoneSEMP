'use client';

import {
    Award,
    BookOpen,
    ClipboardList,
    Home,
    LineChart,
    MessageSquare,
    Mic,
    Settings
} from 'lucide-react';

export const traineeSidebarItems = [
  { label: 'Dashboard', icon: <Home size={20} />, href: '/trainee/dashboard' },
  { label: 'Microlearning Hub', icon: <BookOpen size={20} />, href: '/trainee/microlearning' },
  { label: 'Assessments', icon: <ClipboardList size={20} />, href: '/trainee/assessment' },
  { label: 'Call Simulation', icon: <Mic size={20} />, href: '/trainee/call-simulation' },
  { label: 'My Coaching', icon: <MessageSquare size={20} />, href: '/trainee/coaching' },
  { label: 'My Progress', icon: <LineChart size={20} />, href: '/trainee/progress' },
  { label: 'Certificates', icon: <Award size={20} />, href: '/trainee/certificates' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/trainee/settings' },
];
