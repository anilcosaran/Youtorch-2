export interface FlowStep {
  id: string;
  kind: "prompt" | "image" | "video" | "voice";
  /** Model that runs the step; prompts have none. */
  slug?: string;
  /** Billed units per run, in the model's unit (seconds of video, 1K characters of speech). */
  quantity?: number;
  text?: string;
  image?: string;
  note: string;
  /** Render progress while the step is running. */
  progress?: number;
}

export interface Flow {
  name: string;
  endpoint: string;
  steps: FlowStep[];
}

export interface FlowTemplate {
  title: string;
  description: string;
  image: string;
  position?: string;
  slugs: string[];
}

export const teaserFlow: Flow = {
  name: "Launch teaser",
  endpoint: "/v1/flows/launch-teaser",
  steps: [
    {
      id: "brief",
      kind: "prompt",
      text: "Liquid chrome sneaker on a travertine plinth, orange rim light",
      note: "Brief",
    },
    {
      id: "packshot",
      kind: "image",
      slug: "nano-banana-pro",
      quantity: 2,
      image: "/gallery/sneaker.jpg",
      note: "2 variants",
    },
    {
      id: "spot",
      kind: "video",
      slug: "lumen-1",
      quantity: 8,
      image: "/gallery/sneaker.jpg",
      note: "8s · 1080p",
      progress: 64,
    },
    {
      id: "voiceover",
      kind: "voice",
      slug: "eleven-v3",
      quantity: 0.2,
      text: "[confident] Built for the ones who never stop moving.",
      note: "Warm narrator",
    },
  ],
};

export const flowTemplates: FlowTemplate[] = [
  {
    title: "Product teaser",
    description: "Packshot, an 8s spot and a voiceover from one brief.",
    image: "/gallery/sneaker.jpg",
    slugs: ["nano-banana-pro", "lumen-1", "eleven-v3"],
  },
  {
    title: "Podcast clip",
    description: "Turn a script into a narrated, captioned vertical video.",
    image: "/gallery/singer.jpg",
    position: "70% 40%",
    slugs: ["eleven-v3", "veo-3.1"],
  },
  {
    title: "Music visualizer",
    description: "Generate a track, then cut motion to its beat.",
    image: "/gallery/wave.jpg",
    slugs: ["lyria-2", "seedance-2.5"],
  },
  {
    title: "Game asset pack",
    description: "Concept art in, textured game-ready meshes out.",
    image: "/gallery/fox.jpg",
    slugs: ["flux-2-pro", "hunyuan3d-3"],
  },
];
