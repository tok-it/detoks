type BuildPhase = "building" | "ready";
type BuildPhaseListener = (phase: BuildPhase) => void;

const listeners = new Set<BuildPhaseListener>();
let currentPhase: BuildPhase = "ready";

export function onLlamaBuildPhase(fn: BuildPhaseListener): () => void {
	listeners.add(fn);
	if (currentPhase === "building") fn("building");
	return () => listeners.delete(fn);
}

export function emitLlamaBuildPhase(phase: BuildPhase): void {
	currentPhase = phase;
	for (const fn of listeners) fn(phase);
}
