import WorkspaceEditor from '@/app/components/WorkspaceEditor'

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  return <WorkspaceEditor workspaceId={workspaceId} />
}
