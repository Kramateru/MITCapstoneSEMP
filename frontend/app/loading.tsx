export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white">
      <div className="w-full max-w-md rounded-[24px] border border-white/12 bg-white/8 p-8 text-center shadow-[0_30px_90px_-40px_rgba(2,8,23,0.95)] backdrop-blur-xl">
        <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-[3px] border-slate-300/25 border-t-sky-300" />
        <h2 className="text-lg font-semibold tracking-[0.02em] text-white">
          Preparing your workspace
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Loading the latest dashboard content so the experience stays fast and smooth.
        </p>
      </div>
    </div>
  )
}
