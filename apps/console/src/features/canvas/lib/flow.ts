import { costOf } from "@/lib/pricing";
import type { Flow, FlowStep } from "@/mocks/canvas";
import { findModel } from "@/mocks/models";

/** Zero for prompt steps and for steps whose model has left the catalog. */
export function stepCost(step: FlowStep) {
  const model = step.slug ? findModel(step.slug) : undefined;
  return model ? costOf(model, step.quantity ?? 1) : 0;
}

export const flowCost = (flow: Flow) => flow.steps.reduce((sum, step) => sum + stepCost(step), 0);
