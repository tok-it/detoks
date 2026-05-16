import type { PipelineProgressEvent } from "../../core/pipeline/types.js";
import type { ActionTimelineEvent } from "../../core/timeline/types.js";
import type { PtyEvent } from "../../integrations/subprocess/types.js";
import type { PipelineStatusPanel } from "./panels/pipeline-status.js";
import type { TranscriptPanel } from "./panels/transcript.js";
import type { EmbeddedTerminalPane } from "./panels/embedded-terminal.js";

export type AdapterTranscriptSink = "transcript" | "embedded";

export interface RouterSubscribers {
  pipelinePanel: PipelineStatusPanel;
  transcriptPanel: TranscriptPanel;
  // Getter — the embedded pane reference can be swapped at runtime when a
  // new conversation block starts. Resolving lazily avoids stale references.
  getEmbeddedTerminalPane: () => EmbeddedTerminalPane;
}

/**
 * Centralizes pipeline → panel event dispatch.
 *
 * P0 contract: pure forwarding to existing panel methods. No mode logic, no
 * render scheduling — those remain in index.ts. This is the seam where P1
 * subscribers (cache live stream, RAG summary, task DAG, etc.) will plug in.
 */
export class TuiEventRouter {
  constructor(private readonly subs: RouterSubscribers) {}

  routePipelineProgress(event: PipelineProgressEvent): void {
    this.subs.pipelinePanel.update(event);
  }

  routeActionTimeline(event: ActionTimelineEvent): void {
    this.subs.pipelinePanel.updateActionTimelineEvent(event);
  }

  routeAdapterEvent(event: PtyEvent, sink: AdapterTranscriptSink): void {
    if (sink === "embedded") {
      this.subs.getEmbeddedTerminalPane().addEvent(event);
    } else {
      this.subs.transcriptPanel.addEvent(event);
    }
  }

  routeAdapterEventBatch(
    events: readonly PtyEvent[],
    sink: AdapterTranscriptSink,
  ): void {
    for (const event of events) {
      this.routeAdapterEvent(event, sink);
    }
  }
}
