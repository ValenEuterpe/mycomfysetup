import { ComfyWorkflowGraph, ExtractedParameter } from "../types/workflow";

/**
 * Injects parameter values into a cloned ComfyUI API workflow graph.
 */
export function injectWorkflowParameters(
  originalGraph: ComfyWorkflowGraph,
  parameters: ExtractedParameter[]
): ComfyWorkflowGraph {
  const clonedGraph: ComfyWorkflowGraph = JSON.parse(JSON.stringify(originalGraph));

  for (const param of parameters) {
    const { nodeId, inputKey, currentValue } = param;
    if (clonedGraph[nodeId] && clonedGraph[nodeId].inputs) {
      clonedGraph[nodeId].inputs[inputKey] = currentValue;
    }
  }

  return clonedGraph;
}

/**
 * Generates a random seed integer suitable for ComfyUI.
 */
export function generateRandomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000_000_000);
}
