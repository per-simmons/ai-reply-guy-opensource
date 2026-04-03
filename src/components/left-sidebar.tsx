"use client";

import { Home, Brain, BookOpen, Settings } from "lucide-react";

export type Page = "home" | "memory" | "styleguide" | "settings";

interface LeftSidebarProps {
  page: Page;
  onPageChange: (page: Page) => void;
}

const navItems: { page: Page; icon: typeof Home; label: string }[] = [
  { page: "home", icon: Home, label: "Feed" },
  { page: "memory", icon: Brain, label: "Memory" },
  { page: "styleguide", icon: BookOpen, label: "Style Guide" },
  { page: "settings", icon: Settings, label: "Settings" },
];

export function LeftSidebar({ page, onPageChange }: LeftSidebarProps) {
  return (
    <aside className="w-[68px] shrink-0 flex flex-col items-center h-full border-r border-border py-4 gap-2">
      {/* Logo */}
      <div className="mb-4 text-[15px] font-black tracking-tighter">rg</div>

      {navItems.map((item) => (
        <button
          key={item.page}
          onClick={() => onPageChange(item.page)}
          title={item.label}
          className={`p-3 rounded-full transition-colors ${
            page === item.page
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <item.icon className="h-5 w-5" />
        </button>
      ))}
    </aside>
  );
}
