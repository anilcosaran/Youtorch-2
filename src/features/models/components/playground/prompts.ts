import type { Modality } from "@/types/model";

export const promptSuggestions: Record<Modality, string[]> = {
  video: [
    "A paper boat drifting through a neon-lit canal at night",
    "Drone shot over a glacier at sunrise",
    "Slow-motion dancer in red silk",
  ],
  image: ["A chrome banana on a pastel pedestal", "Replace the sky with a pink sunset", "Product shot of headphones on marble"],
  audio: ["Narrate: Welcome back to the show", "A calm voice reading a bedtime story", "Two friends arguing about pizza"],
  "3d": ["Low-poly fox with PBR fur", "Sci-fi helmet with worn metal", "Ceramic vase with glaze drips"],
};

export const outputFrame: Record<Modality, string> = {
  video: "aspect-video",
  image: "aspect-square max-w-[280px]",
  "3d": "aspect-square max-w-[280px]",
  audio: "h-20",
};
