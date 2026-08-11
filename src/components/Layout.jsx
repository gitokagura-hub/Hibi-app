import BottomNavigation from "./BottomNavigation";
import SpaceSwitcher from "./SpaceSwitcher";

export default function Layout({ title, subtitle, current, setTab, children }) {
  return (
    <div className="h-[100dvh] overflow-hidden bg-app-bg text-ink flex flex-col">
      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        <header className="bg-app-bg">
          <div className="px-5 pt-14 pb-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-ink-sub">
                {subtitle}
              </p>
            )}
          </div>
        </header>
        <SpaceSwitcher />
        {children}
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation current={current} setTab={setTab} />
    </div>
  );
}
