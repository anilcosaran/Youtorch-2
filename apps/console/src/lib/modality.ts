import { AudioLines, Box, Clapperboard, ImageIcon, Type, type LucideIcon } from "lucide-react";
import type { Medium, Modality } from "@/types/model";

export const modalityOrder: Modality[] = ["video", "image", "audio", "3d"];

export const modalityLabel: Record<Modality, string> = {
  video: "Video",
  image: "Image",
  audio: "Audio",
  "3d": "3D",
};

export const modalityIcon: Record<Modality, LucideIcon> = {
  video: Clapperboard,
  image: ImageIcon,
  audio: AudioLines,
  "3d": Box,
};

export const modalityColors: Record<Modality, string> = {
  video: "var(--color-iris-400)",
  image: "var(--color-sky-chart)",
  audio: "var(--color-jade-400)",
  "3d": "var(--color-amber-chart)",
};

export const mediumMeta: Record<Medium, { label: string; icon: LucideIcon }> = {
  text: { label: "Text", icon: Type },
  image: { label: "Image", icon: ImageIcon },
  video: { label: "Video", icon: Clapperboard },
  audio: { label: "Audio", icon: AudioLines },
  "3d": { label: "3D", icon: Box },
};
