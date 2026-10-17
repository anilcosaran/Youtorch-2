import type { Medium } from "@/types/model";

export type AppCategory = "Image" | "Video" | "Audio" | "3D";

/** How the app's hero sample is presented. */
export type AppShowcase =
  | { kind: "compare"; before: string; after: string; transparent?: boolean; lowRes?: boolean }
  | { kind: "video"; image: string; seconds: number }
  | { kind: "audio"; image: string; seconds: number; script: string }
  | { kind: "gallery"; images: string[] };

export interface AppOption {
  id: string;
  label: string;
  options: string[];
}

export interface App {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: AppCategory;
  /** Model that runs every job. */
  model: string;
  /** What the user brings: a file of this medium, or a script for `text`. */
  input: Extract<Medium, "image" | "audio" | "text">;
  /** Output units billed per run, in the model's unit. */
  units: number;
  cover: string;
  position?: string;
  badge?: "New" | "Top";
  showcase: AppShowcase;
  options: AppOption[];
  steps: [string, string, string];
}

export const apps: App[] = [
  {
    slug: "background-remover",
    name: "Background Remover",
    tagline: "Clean cutouts with soft hair edges.",
    description: "Drop a photo and get a transparent PNG in seconds. Hair, fur and glass keep their soft edges.",
    category: "Image",
    model: "nano-banana-pro",
    input: "image",
    units: 1,
    cover: "/gallery/cutout.jpg",
    position: "50% 30%",
    badge: "New",
    showcase: { kind: "compare", before: "/gallery/cutout.jpg", after: "/gallery/cutout.png", transparent: true },
    options: [
      { id: "background", label: "Background", options: ["Transparent", "White", "Blur"] },
      { id: "edges", label: "Edges", options: ["Soft hair", "Sharp"] },
    ],
    steps: ["Upload a photo", "Pick a background", "Download the PNG"],
  },
  {
    slug: "upscaler",
    name: "4K Upscaler",
    tagline: "Recover fine detail without halos.",
    description: "Upscale photos and renders up to 4× while rebuilding texture instead of smearing it.",
    category: "Image",
    model: "seedream-4-5",
    input: "image",
    units: 1,
    cover: "/gallery/macaw.jpg",
    position: "45% 45%",
    showcase: { kind: "compare", before: "/gallery/macaw.jpg", after: "/gallery/macaw.jpg", lowRes: true },
    options: [
      { id: "scale", label: "Scale", options: ["2×", "4×"] },
      { id: "style", label: "Content", options: ["Photo", "Illustration"] },
    ],
    steps: ["Upload an image", "Choose 2× or 4×", "Download in full resolution"],
  },
  {
    slug: "image-to-video",
    name: "Image to Video",
    tagline: "Turn any still into a moving shot.",
    description: "Animate a photo or artwork with natural motion and a camera move of your choice.",
    category: "Video",
    model: "lumen-1",
    input: "image",
    units: 5,
    cover: "/gallery/balloons.jpg",
    position: "60% 40%",
    badge: "Top",
    showcase: { kind: "video", image: "/gallery/balloons.jpg", seconds: 5 },
    options: [
      { id: "duration", label: "Duration", options: ["5s", "10s"] },
      { id: "motion", label: "Motion", options: ["Subtle", "Dynamic"] },
      { id: "camera", label: "Camera", options: ["Static", "Push in", "Orbit"] },
    ],
    steps: ["Upload a still", "Pick motion and camera", "Download the clip"],
  },
  {
    slug: "product-shots",
    name: "Product Shots",
    tagline: "Studio-grade product photos from one picture.",
    description: "Place your product in a lit studio scene with realistic shadows and reflections.",
    category: "Image",
    model: "flux-2-pro",
    input: "image",
    units: 2,
    cover: "/gallery/perfume.jpg",
    position: "50% 50%",
    showcase: { kind: "gallery", images: ["/gallery/perfume.jpg", "/gallery/sneaker.jpg"] },
    options: [
      { id: "scene", label: "Scene", options: ["Studio", "Travertine", "Splash", "Outdoor"] },
      { id: "count", label: "Variations", options: ["1", "2", "4"] },
    ],
    steps: ["Upload a product photo", "Pick a scene", "Download every variation"],
  },
  {
    slug: "voiceover",
    name: "Voiceover",
    tagline: "Expressive narration in 70+ languages.",
    description: "Paste a script and get studio-quality narration with natural pauses and emotion.",
    category: "Audio",
    model: "eleven-v3",
    input: "text",
    units: 0.4,
    cover: "/gallery/singer.jpg",
    position: "60% 40%",
    badge: "Top",
    showcase: {
      kind: "audio",
      image: "/gallery/singer.jpg",
      seconds: 9,
      script: "[warm] Welcome back to the show. Today we go behind the scenes of our biggest launch yet.",
    },
    options: [
      { id: "voice", label: "Voice", options: ["Aria", "Roger", "Sarah", "Charlie"] },
      { id: "language", label: "Language", options: ["English", "Turkish", "Spanish", "German"] },
    ],
    steps: ["Paste your script", "Pick a voice", "Download the audio"],
  },
  {
    slug: "voice-changer",
    name: "Voice Changer",
    tagline: "Say it once, hear it in any voice.",
    description: "Upload a recording and swap the voice while keeping timing, emotion and breaths.",
    category: "Audio",
    model: "eleven-v3",
    input: "audio",
    units: 0.6,
    cover: "/gallery/dancer.jpg",
    position: "50% 35%",
    badge: "New",
    showcase: {
      kind: "audio",
      image: "/gallery/dancer.jpg",
      seconds: 7,
      script: "Original take re-voiced as Charlie, same timing and delivery.",
    },
    options: [
      { id: "voice", label: "Target voice", options: ["Charlie", "Aria", "Roger", "Sarah"] },
      { id: "emotion", label: "Delivery", options: ["Keep original", "Calmer", "More energy"] },
    ],
    steps: ["Upload a recording", "Pick the new voice", "Download the result"],
  },
  {
    slug: "image-to-3d",
    name: "Image to 3D",
    tagline: "Game-ready meshes from a single image.",
    description: "Turn a concept or product photo into a textured 3D model you can drop into any engine.",
    category: "3D",
    model: "hunyuan3d-3",
    input: "image",
    units: 1,
    cover: "/gallery/fox.jpg",
    position: "50% 50%",
    showcase: { kind: "gallery", images: ["/gallery/fox.jpg", "/gallery/cabin.jpg"] },
    options: [
      { id: "format", label: "Format", options: ["GLB", "FBX", "USDZ"] },
      { id: "quality", label: "Quality", options: ["Draft", "Standard", "High"] },
    ],
    steps: ["Upload an image", "Pick a format", "Download the mesh"],
  },
];

export const appCategories: AppCategory[] = ["Image", "Video", "Audio", "3D"];

export const findApp = (slug: string) => apps.find((a) => a.slug === slug);
