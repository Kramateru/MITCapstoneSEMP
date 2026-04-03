'use client'

import WorkspaceEditor from '@/app/components/WorkspaceEditor'

export default function WorkspacePage({ params }: { params: { workspaceId: string } }) {
  const { workspaceId } = params
  return <WorkspaceEditor workspaceId={workspaceId} />
}
