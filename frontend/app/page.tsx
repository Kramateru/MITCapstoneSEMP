'use client'

import { useAuth } from '@/app/context/AuthContext'
import { navigateToPath } from '@/app/utils/auth-navigation'
import { useEffect } from 'react'

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        navigateToPath('/dashboard')
      } else {
        navigateToPath('/login')
      }
    }
  }, [isLoading, isAuthenticated])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-800 to-blue-200 flex items-center justify-center p-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center mb-6">
          <div className="h-28 w-28 rounded-full bg-white/95 p-3 ring-2 ring-yellow-300/80 shadow-lg">
            <img
              src="/st-peter-seal.png"
              alt="St. Peter Velle Technical Training Center"
              className="h-full w-full object-contain"
            />
          </div>
        </div>
        <h1 className="text-5xl font-bold text-white mb-2">Speech-Enabled Microlearning Platform</h1>
          <p className="text-lg text-blue-100 mb-3">for Language Assessment</p>
          <p className="text-sm text-blue-200 mb-8">St. Peter Velle Technical Training Center, Inc.</p>
        
        <div className="inline-block">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-300"></div>
        </div>
        <p className="text-blue-100 mt-4">Redirecting to your dashboard...</p>
      </div>
    </div>
  )
}
