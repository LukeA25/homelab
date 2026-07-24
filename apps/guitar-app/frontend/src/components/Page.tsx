import type { ReactNode } from "react";

type PageProps = {
  children: ReactNode;
  denseBottom?: boolean;
  className?: string;
};

export function Page({ children, denseBottom = false, className = "" }: PageProps) {
  return (
    <div
      className={[
        "mx-auto w-full min-w-0 max-w-7xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-6 md:pt-6 lg:px-8",
        denseBottom ? "pb-40 md:pb-10" : "pb-28 md:pb-10",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted md:hidden">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-bold text-text md:mt-0 md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-xl text-sm text-muted md:text-base">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
