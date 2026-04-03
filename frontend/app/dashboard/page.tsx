'use client'

import AdminDashboard from '@/app/components/AdminDashboard'
import TraineeDashboard from '@/app/components/TraineeDashboard'
import TrainerDashboard from '@/app/components/TrainerDashboard'
import { useAuth } from '@/app/context/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function DashboardPage() {
  const router = useRouter()
  const { user, isLoading, isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isLoading, isAuthenticated, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <div className="text-center">
          <div className="inline-block">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
          </div>
          <p className="mt-4 text-blue-900">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return null // Will redirect to login
  }

  // Route to appropriate dashboard based on role
  switch (user.user_role) {
    case 'admin':
      return <AdminDashboard />
    case 'trainer':
      return <TrainerDashboard />
    case 'trainee':
      return <TraineeDashboard />
    default:
      return <div>Unknown role: {user.user_role}</div>
  }
}
