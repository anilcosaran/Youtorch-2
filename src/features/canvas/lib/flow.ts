import { discounted } from "@/lib/pricing";
import type { Flow, FlowStep } from "@/mocks/canvas";
import { getModel } from "@/mocks/models";

export const stepCost = (step: FlowStep) => (step.slug ? discounted(getModel(step.slug)) * (step.quantity ?? 1) : 0);

export const flowCost = (flow: Flow) => flow.steps.reduce((sum, step) => sum + stepCost(step), 0);
