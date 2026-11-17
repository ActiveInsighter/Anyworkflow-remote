"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import type { ReactNode } from "react";
import { MapPin, CloudSun, Terminal } from "lucide-react";
import { ToolTraceCard, ToolErrorCard, ToolStatusCard } from "./shared/tool-trace";
import { ShimmerLabel } from "@/components/assistant-ui/elements/surfaces";
import { CollapsibleTrigger } from "@/components/assistant-ui/ui/collapsible";
import {
  TraceLine,
  TraceMarker,
  formatDuration,
  useToolDuration,
} from "./shared/trace-line";

export const disclosureContentClass =
  "border-foreground/10 ms-[5px] border-s ps-4";

export function DisclosureTrigger({
  live,
  label,
  detail,
}: {
  live: boolean;
  label: string;
  detail?: string;
}): ReactNode {
  return (
    <CollapsibleTrigger className="group/trigger my-1 flex max-w-full items-baseline gap-2 text-left font-mono text-[12px] outline-none [font-variant-ligatures:none] focus-visible:underline">
      <TraceMarker
        live={live}
        className="group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90"
      />
      <span className="text-muted-foreground group-hover/trigger:text-foreground min-w-0 truncate transition-colors">
        {live ? (
          <ShimmerLabel>
            {label}
            {detail ? ` ${detail}` : null}
          </ShimmerLabel>
        ) : (
          <>
            {label}
            {detail ? ` ${detail}` : null}
          </>
        )}
      </span>
    </CollapsibleTrigger>
  );
}

export function ToolCall({ toolName, args, result, status, isError }: ToolCallMessagePartProps): ReactNode {
  const icon = toolName === 'geocode_location' ? <MapPin /> : toolName === 'get_weather' ? <CloudSun /> : <Terminal />;
  if (isError) return <ToolErrorCard signature={toolName} args={args} error={typeof result === 'string' ? result : JSON.stringify(result)} />;
  if (result === undefined) return <ToolStatusCard signature={toolName} icon={icon} message={status?.type === 'running' ? 'Running…' : 'No linked result returned'} loading={status?.type === 'running'} />;
  return <ToolTraceCard icon={icon} signature={toolName} description={null} args={args} result={result} />;
}
