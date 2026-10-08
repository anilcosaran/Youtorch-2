export interface ShowcaseSlide {
  slug: string;
  image: string;
  /** Optional looping clip; the image doubles as its poster. */
  video?: string;
  headline: string;
}

export type AppEffect = "motion" | "cutout" | "upscale" | "voice";

export interface FeaturedApp {
  title: string;
  description: string;
  slug: string;
  image: string;
  /** Transparent version of `image`, shown on the after side of the cutout split. */
  cutout?: string;
  position?: string;
  badge?: "Top" | "New";
  /** Hover glow and border tint. */
  accent: string;
  effect: AppEffect;
  prompt: string;
}

export interface GalleryShot {
  image: string;
  title: string;
  slug: string;
  prompt: string;
  /** Clip length for video outputs; billed per second. */
  seconds?: number;
}

export interface Promo {
  slug: string;
  image: string;
  position: string;
  eyebrow: string;
  title: string;
  /** Last day of the offer, shown in the price line. */
  until: string;
}

export const showcaseSlides: ShowcaseSlide[] = [
  { slug: "lumen-1", image: "/showcase/lumen.jpg", headline: "Directed shots, consistent characters" },
  { slug: "seedance-2-5", image: "/showcase/seedance.jpg", headline: "Motion that follows the music" },
  { slug: "veo-3-1", image: "/showcase/veo.jpg", headline: "Cinematic 1080p with native sound" },
  { slug: "nano-banana-pro", image: "/showcase/nano-banana.jpg", headline: "Edit images by talking to them" },
];

export const promo: Promo = {
  slug: "seedance-2-5",
  image: "/gallery/wave.jpg",
  position: "62% 50%",
  eyebrow: "Seedance 2.5 · ByteDance",
  title: "Half price on every second of motion",
  until: "Oct 14",
};

export const featuredApps: FeaturedApp[] = [
  {
    title: "Image to video",
    description: "Turn any still into a moving shot.",
    slug: "lumen-1",
    image: "/gallery/balloons.jpg",
    position: "60% 40%",
    badge: "Top",
    accent: "#ff7a45",
    effect: "motion",
    prompt: "Animate this still: balloons drift upward over Cappadocia at sunrise, slow aerial push-in",
  },
  {
    title: "Background remover",
    description: "Clean cutouts with soft hair edges.",
    slug: "nano-banana-pro",
    image: "/gallery/cutout.jpg",
    cutout: "/gallery/cutout.png",
    position: "50% 30%",
    badge: "New",
    accent: "#ffb703",
    effect: "cutout",
    prompt: "Remove the background and keep soft hair edges, export as transparent PNG",
  },
  {
    title: "4K upscaler",
    description: "Recover fine detail without artifacts.",
    slug: "seedream-4-5",
    image: "/gallery/macaw.jpg",
    position: "45% 45%",
    accent: "#ff4d3d",
    effect: "upscale",
    prompt: "Upscale to 4K and recover every feather barb without halos",
  },
  {
    title: "Voiceover",
    description: "Expressive narration in 70+ languages.",
    slug: "eleven-v3",
    image: "/gallery/singer.jpg",
    position: "60% 40%",
    badge: "Top",
    accent: "#c04dff",
    effect: "voice",
    prompt: "[warm] Welcome back to the show. Today we go behind the scenes.",
  },
];

export const galleryShots: GalleryShot[] = [
  {
    image: "/gallery/boat.jpg",
    title: "Paper boat, neon canal",
    slug: "lumen-1",
    seconds: 8,
    prompt: "A paper boat drifting through a neon-lit canal at night, rain ripples, 35mm film look",
  },
  {
    image: "/gallery/sneaker.jpg",
    title: "Liquid chrome sneaker",
    slug: "flux-2-pro",
    prompt: "Liquid chrome sneaker dripping over a travertine plinth, orange rim light, black studio",
  },
  {
    image: "/gallery/glacier.jpg",
    title: "Glacier at first light",
    slug: "veo-3-1",
    seconds: 8,
    prompt: "Drone shot gliding over a blue glacier at sunrise, climbers for scale, low clouds",
  },
  {
    image: "/gallery/rider.jpg",
    title: "Salt flat run",
    slug: "seedance-2-5",
    seconds: 10,
    prompt: "Vintage rider tearing across a salt flat at dusk, low tracking shot, dust trail",
  },
  {
    image: "/gallery/koi.jpg",
    title: "Koi in ink",
    slug: "wan-2-6",
    seconds: 6,
    prompt: "Two koi circling through blooming black ink, top-down, slow and elegant",
  },
  {
    image: "/gallery/fox.jpg",
    title: "Terracotta fox",
    slug: "hunyuan3d-3",
    prompt: "Low-poly terracotta fox sitting on a turntable, game-ready topology, PBR clay",
  },
  {
    image: "/gallery/cabin.jpg",
    title: "Snow cabin island",
    slug: "hunyuan3d-3",
    prompt: "Isometric wooden cabin on a floating snowy island, glowing windows, game asset",
  },
  {
    image: "/gallery/dancer.jpg",
    title: "Rain alley jump",
    slug: "hailuo-03",
    seconds: 6,
    prompt: "Street dancer leaping through a rain-soaked lantern alley, splash on landing, slow motion",
  },
  {
    image: "/gallery/perfume.jpg",
    title: "Amber splash",
    slug: "flux-2-pro",
    prompt: "Faceted perfume bottle frozen in a swirl of amber liquid, golden backlight, droplets",
  },
  {
    image: "/gallery/flowers.jpg",
    title: "In full bloom",
    slug: "seedream-4-5",
    prompt: "Profile portrait whose hair blooms into pastel flowers and butterflies, peach backdrop",
  },
  {
    image: "/gallery/car.jpg",
    title: "Desert drift",
    slug: "kling-3",
    seconds: 5,
    prompt: "Red vintage coupe drifting on a desert road at sunset, huge dust plume, low angle",
  },
];

export const buildPoints = [
  "Automatic failover across 8 regions",
  "Billed per second of output, no subscription",
  "Webhooks and signed URLs for every result",
];
