import BottomNavigation from "./BottomNavigation";

export default function Layout({ title, subtitle, current, setTab, children }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="bg-white sticky top-0 z-10">
        <div className="px-5 pt-14 pb-5">
          <h1 className="text-3xl font-semibold tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">
              {subtitle}
            </p>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation current={current} setTab={setTab} />
    </div>
  );
}
