import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { Boxes, Calculator, LayoutDashboard, Link2, LogOut, Moon, Plus, Receipt, Settings, Smartphone, Sun, Wrench, type LucideIcon } from "lucide-react";
import { useAuth } from "../data/auth";
import { useData } from "../data/store";
import { useEditors } from "../components/editors";
import { IconButton } from "../components/ui";
import { useTheme } from "../lib/theme";
import { cx } from "../lib/format";
import { isLowStock } from "../lib/calc";

const nav: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inventory", label: "Inventory", icon: Smartphone },
  { to: "/deal-check", label: "Deal check", icon: Calculator },
  { to: "/repairs", label: "Repairs", icon: Wrench },
  { to: "/parts", label: "Parts", icon: Boxes },
  { to: "/expenses", label: "Expenses", icon: Receipt },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 font-dot text-xl leading-none font-bold tracking-tight uppercase", className)}>
      PhoneBiz
      <span className="mb-2.5 size-1.5 rounded-full bg-signal" aria-hidden />
    </span>
  );
}

function NewMenu({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const openEditor = useEditors();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: [string, LucideIcon, () => void][] = [
    ["Device", Smartphone, () => openEditor({ kind: "device" })],
    ["From willhaben", Link2, () => openEditor({ kind: "willhaben" })],
    ["Repair job", Wrench, () => openEditor({ kind: "repair" })],
    ["Expense", Receipt, () => openEditor({ kind: "expense" })],
    ["Part", Boxes, () => openEditor({ kind: "part" })],
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="New"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "label-mono flex items-center justify-center gap-1.5 rounded-full bg-zinc-900 font-bold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200",
          compact ? "size-8" : "h-8 px-3.5",
        )}
      >
        <Plus className="size-3.5" strokeWidth={2.5} />
        {!compact && "New"}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-48 animate-slide-up rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
          {items.map(([label, Icon, action]) => (
            <button
              key={label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                action();
              }}
              className="label-mono flex w-full items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              <Icon className="size-4 text-zinc-500" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const bar = "rounded-2xl border border-zinc-200/70 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95";

export function AppLayout() {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { parts, isDemo } = useData();
  const lowStock = parts.filter(isLowStock).length;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-3 z-30 mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-5xl">
        <div className={cx(bar, "flex h-12 items-center justify-between gap-3 px-4")}>
          <NavLink to="/" aria-label="Dashboard">
            <Logo />
          </NavLink>

          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cx(
                    "label-mono relative rounded-full px-3 py-1.5 transition-colors",
                    isActive ? "bg-zinc-900 text-white dark:bg-white dark:text-black" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100",
                  )
                }
              >
                {label}
                {to === "/parts" && lowStock > 0 && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-400" />}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <IconButton label="Toggle theme" onClick={toggle} className="size-8">
              {theme === "dark" ? <Sun /> : <Moon />}
            </IconButton>
            <NavLink to="/settings" aria-label="Settings" className={({ isActive }) => cx("inline-flex size-8 items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 [&_svg]:size-[18px]", isActive ? "text-zinc-900 dark:text-white" : "text-zinc-500")}>
              <Settings />
            </NavLink>
            {user?.photoURL && <img src={user.photoURL} alt={user.name} title={user.name} referrerPolicy="no-referrer" className="ml-1 hidden size-7 rounded-full grayscale sm:block" />}
            <IconButton label="Sign out" onClick={() => void signOut()} className="hidden size-8 sm:inline-flex">
              <LogOut />
            </IconButton>
            <div className="ml-1">
              <NewMenu compact={false} />
            </div>
          </div>
        </div>

        {isDemo && (
          <div className={cx(bar, "label-mono mt-2 flex h-7 items-center justify-center gap-2 text-zinc-600 dark:text-zinc-400")}>
            <span className="size-1.5 rounded-full bg-signal" /> Demo mode — data stays in this browser
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-10 pb-28 sm:px-6 lg:pt-14 lg:pb-16">
        <Outlet />
      </main>

      <nav className={cx(bar, "fixed inset-x-3 bottom-3 z-30 grid grid-cols-6 p-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] lg:hidden")}>
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cx(
                "relative flex flex-col items-center gap-1 rounded-xl py-2 font-mono text-[9px] tracking-wider uppercase transition-colors",
                isActive ? "bg-zinc-900 text-white dark:bg-white dark:text-black" : "text-zinc-400",
              )
            }
          >
            <Icon className="size-[18px]" />
            {label}
            {to === "/parts" && lowStock > 0 && <span className="absolute top-2 left-1/2 ml-2 size-1.5 rounded-full bg-amber-400" />}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
