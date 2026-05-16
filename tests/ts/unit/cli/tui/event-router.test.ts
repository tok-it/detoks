import { describe, expect, it, vi } from "vitest";
import { TuiEventRouter, type RouterSubscribers } from "../../../../../src/cli/tui/event-router.js";
import type { PipelineProgressEvent } from "../../../../../src/core/pipeline/types.js";
import type { ActionTimelineEvent } from "../../../../../src/core/timeline/types.js";
import type { PtyEvent } from "../../../../../src/integrations/subprocess/types.js";

const makeSubs = () => {
  const pipelinePanel = {
    update: vi.fn(),
    updateActionTimelineEvent: vi.fn(),
  };
  const transcriptPanel = { addEvent: vi.fn() };
  const embeddedPane = { addEvent: vi.fn() };
  const subs: RouterSubscribers = {
    pipelinePanel: pipelinePanel as any,
    transcriptPanel: transcriptPanel as any,
    getEmbeddedTerminalPane: () => embeddedPane as any,
  };
  return { subs, pipelinePanel, transcriptPanel, embeddedPane };
};

describe("TuiEventRouter", () => {
  it("routes pipeline progress to the pipeline panel only", () => {
    const { subs, pipelinePanel, transcriptPanel, embeddedPane } = makeSubs();
    const router = new TuiEventRouter(subs);
    const event: PipelineProgressEvent = {
      stage: "Prompt Compiler",
      status: "end",
      message: "ok",
    };
    router.routePipelineProgress(event);
    expect(pipelinePanel.update).toHaveBeenCalledWith(event);
    expect(transcriptPanel.addEvent).not.toHaveBeenCalled();
    expect(embeddedPane.addEvent).not.toHaveBeenCalled();
  });

  it("routes action-timeline events to the pipeline panel", () => {
    const { subs, pipelinePanel, transcriptPanel, embeddedPane } = makeSubs();
    const router = new TuiEventRouter(subs);
    const event: ActionTimelineEvent = {
      kind: "cache_hit",
      source: "pipeline",
      summary: "x",
    } as ActionTimelineEvent;
    router.routeActionTimeline(event);
    expect(pipelinePanel.updateActionTimelineEvent).toHaveBeenCalledWith(event);
    expect(transcriptPanel.addEvent).not.toHaveBeenCalled();
    expect(embeddedPane.addEvent).not.toHaveBeenCalled();
  });

  it("routes adapter events to transcript sink when requested", () => {
    const { subs, transcriptPanel, embeddedPane } = makeSubs();
    const router = new TuiEventRouter(subs);
    const event: PtyEvent = { type: "chunk", stream: "stdout", data: "hi" } as PtyEvent;
    router.routeAdapterEvent(event, "transcript");
    expect(transcriptPanel.addEvent).toHaveBeenCalledWith(event);
    expect(embeddedPane.addEvent).not.toHaveBeenCalled();
  });

  it("routes adapter events to embedded sink when requested", () => {
    const { subs, transcriptPanel, embeddedPane } = makeSubs();
    const router = new TuiEventRouter(subs);
    const event: PtyEvent = { type: "chunk", stream: "stdout", data: "hi" } as PtyEvent;
    router.routeAdapterEvent(event, "embedded");
    expect(embeddedPane.addEvent).toHaveBeenCalledWith(event);
    expect(transcriptPanel.addEvent).not.toHaveBeenCalled();
  });

  it("re-resolves the embedded pane through the getter on each call", () => {
    let currentPane = { addEvent: vi.fn() };
    const newPane = { addEvent: vi.fn() };
    const subs: RouterSubscribers = {
      pipelinePanel: { update: vi.fn(), updateActionTimelineEvent: vi.fn() } as any,
      transcriptPanel: { addEvent: vi.fn() } as any,
      getEmbeddedTerminalPane: () => currentPane as any,
    };
    const router = new TuiEventRouter(subs);
    const event: PtyEvent = { type: "chunk", stream: "stdout", data: "a" } as PtyEvent;

    router.routeAdapterEvent(event, "embedded");
    expect(currentPane.addEvent).toHaveBeenCalledWith(event);

    // Swap the pane (simulates a new conversation block) and dispatch again.
    currentPane = newPane;
    router.routeAdapterEvent(event, "embedded");
    expect(newPane.addEvent).toHaveBeenCalledWith(event);
  });

  it("batches adapter events to the chosen sink", () => {
    const { subs, transcriptPanel, embeddedPane } = makeSubs();
    const router = new TuiEventRouter(subs);
    const events: PtyEvent[] = [
      { type: "chunk", stream: "stdout", data: "a" } as PtyEvent,
      { type: "chunk", stream: "stdout", data: "b" } as PtyEvent,
      { type: "exit", exitCode: 0 } as unknown as PtyEvent,
    ];
    router.routeAdapterEventBatch(events, "transcript");
    expect(transcriptPanel.addEvent).toHaveBeenCalledTimes(3);
    expect(embeddedPane.addEvent).not.toHaveBeenCalled();
  });
});
