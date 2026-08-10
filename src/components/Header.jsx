export default function Header({ title, subtitle }) {
  return (
    <header className="bg-app-bg sticky top-0 z-10">
      <div className="px-5 pt-14 pb-5">
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
  );
}
