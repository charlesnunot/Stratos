export default function ChatPageLoading() {
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col animate-in fade-in duration-150">
      <div className="border-b p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-md bg-muted" />
          <div className="flex flex-1 items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className="h-12 w-48 max-w-[80%] rounded-lg bg-muted"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          </div>
        ))}
      </div>
      <div className="border-t p-4">
        <div className="flex gap-2">
          <div className="h-10 flex-1 rounded-md bg-muted" />
          <div className="h-10 w-16 rounded-md bg-muted" />
        </div>
      </div>
    </div>
  )
}
