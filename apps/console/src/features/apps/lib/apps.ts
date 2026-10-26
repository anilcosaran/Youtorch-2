import type { App } from "@/mocks/apps";

export const appHref = (slug: string) => `/apps/${slug}`;

export const defaultValues = (app: App) => Object.fromEntries(app.options.map((o) => [o.id, o.options[0]]));

/** What the hero's main button asks for. */
export function inputCopy(app: App) {
  switch (app.input) {
    case "image":
      return { action: "Upload image", hint: "JPG, PNG or WebP · up to 20 MB", accept: "image/*" };
    case "audio":
      return { action: "Upload audio", hint: "MP3, WAV or M4A · up to 5 min", accept: "audio/*" };
    case "text":
      return { action: "Write a script", hint: "Up to 5,000 characters per run", accept: "" };
  }
}

/** Results are kept on this device; uploads are shrunk so history fits in local storage. */
export async function thumbnail(file: File, max = 640) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}
