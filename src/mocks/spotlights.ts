export interface SpotlightClip {
  title: string;
  prompt: string;
  image: string;
  seconds: number;
  position?: string;
}

export interface SpotlightVoice {
  name: string;
  style: string;
  language: string;
  /** Emotion tags in square brackets are part of the script, as the API takes them. */
  script: string;
  seconds: number;
  /** Avatar gradient. */
  colors: [string, string];
}

export interface Spotlight<T> {
  slug: string;
  tagline: string;
  /** Title gradient, as CSS colors that adapt to the theme. */
  accent: [string, string];
  items: T[];
}

export const lumenSpotlight: Spotlight<SpotlightClip> = {
  slug: "lumen-1",
  tagline: "Our in-house cinematic model. Directed camera paths, consistent characters and native sound up to 20s.",
  accent: ["var(--color-ember-300)", "var(--color-iris-300)"],
  items: [
    {
      title: "Rooftop ronin",
      prompt: "Hooded ronin on a rain-soaked rooftop above a neon city, slow push-in, distant thunder",
      image: "/showcase/lumen.jpg",
      seconds: 12,
    },
    {
      title: "Diver and the jellyfish",
      prompt: "Brass-helmet diver drifting past a glowing jellyfish, god rays from the surface, slow orbit",
      image: "/showcase/veo.jpg",
      seconds: 8,
      position: "70% 50%",
    },
    {
      title: "Cappadocia dawn",
      prompt: "Hot air balloons rising over Cappadocia at dawn, slow crane up, wind and burner hiss",
      image: "/gallery/balloons.jpg",
      seconds: 10,
      position: "60% 40%",
    },
  ],
};

export const elevenSpotlight: Spotlight<SpotlightVoice> = {
  slug: "eleven-v3",
  tagline: "Expressive speech in 70+ languages. Steer the delivery with tags like [warm] or [whispers].",
  accent: ["var(--color-iris-300)", "var(--color-jade-400)"],
  items: [
    {
      name: "Mara",
      style: "Warm narrator",
      language: "English",
      script: "[warm] Welcome back to the show. Today we go behind the scenes.",
      seconds: 7,
      colors: ["#ff9f7a", "#7a66ee"],
    },
    {
      name: "Kenji",
      style: "Calm guide",
      language: "Japanese",
      script: "[soft] 深呼吸して、ゆっくりと目を閉じてください。",
      seconds: 6,
      colors: ["#5aa9ff", "#3ddc97"],
    },
    {
      name: "Lucía",
      style: "Hype host",
      language: "Spanish",
      script: "[excited] ¡No vas a creer lo que acaba de salir! Vamos a verlo.",
      seconds: 5,
      colors: ["#ffe66b", "#ff6b81"],
    },
  ],
};
