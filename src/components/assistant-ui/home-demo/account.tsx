"use client";
import type { ReactNode } from "react";

import { Menu } from "@base-ui/react/menu";
import {
  ChevronUpIcon,
  LogInIcon,
  LogOutIcon,
  SettingsIcon,
} from "lucide-react";
import { useDemoIntegration } from "./integration";
import { cn } from "@/lib/utils";
import { menuContentClass, menuItemClass } from "./styles";
type SessionUser = { name: string; image?: string };

const rowClass =
  "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] rounded-control flex h-8 w-full items-center gap-2 px-2 text-[13px] transition-colors";

export function SidebarAccount(): ReactNode {
  const { accountName } = useDemoIntegration();
  return <div className="border-foreground/10 -mx-3 mt-3 -mb-3 shrink-0 border-t p-3"><AccountMenu user={{ name: accountName }} /></div>;
}

function AccountMenu({ user }: { user: SessionUser }): ReactNode {
  const { openSettings, signOut } = useDemoIntegration();

  return (
    <>
      {/* The menu popup is portalled out; the form stays here so submitting it
          survives the popup unmounting on select. */}

      <Menu.Root>
        <Menu.Trigger
          aria-label="Account"
          render={<button type="button" className={rowClass} />}
        >
          <Avatar user={user} />
          <span className="text-foreground min-w-0 flex-1 truncate text-left">
            {user.name}
          </span>
          <ChevronUpIcon className="size-3 shrink-0" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            className="isolate z-50 outline-none"
            side="top"
            align="start"
            sideOffset={6}
          >
            <Menu.Popup className={cn(menuContentClass, "min-w-44")}>
              <Menu.Item
                className={menuItemClass}
                onClick={openSettings}
              >
                <SettingsIcon className="size-3.5" />
                Settings
              </Menu.Item>
              <Menu.Item
                className={menuItemClass}
                onClick={() => {
                  signOut();
                }}
              >
                <LogOutIcon className="size-3.5" />
                Sign out
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : "";
  return `${first}${last}`.toUpperCase();
}

// A portrait in this register is a plate, not a bubble: square at the document
// radius, like the code sheets and diagram plates.
function Avatar({ user }: { user: SessionUser }): ReactNode {
  if (user.image) {
    return (
      <img
        src={user.image}
        alt=""
        width={20}
        height={20}
        className="size-5 shrink-0 rounded-sm object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="bg-foreground/[0.08] grid size-5 shrink-0 place-items-center rounded-sm font-mono text-[10px] [font-variant-ligatures:none]"
    >
      {initials(user.name)}
    </span>
  );
}
