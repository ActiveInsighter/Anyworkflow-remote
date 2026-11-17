"use client";

import type { ReactNode } from "react";
import { typeSection } from "./shared/type";


function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function Greeting(): ReactNode {

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 mx-auto mb-8 flex w-full max-w-(--thread-max-width) flex-col items-center text-center duration-200">
      <p className={typeSection}>
        How can I help you today?
      </p>
    </div>
  );
}
