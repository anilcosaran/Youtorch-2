import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { ModelArt } from "@/features/models/components/model-art";
import { flowTemplates } from "@/mocks/canvas";
import { findModels } from "@/mocks/models";

/** Starter flows. They open on the board once Canvas is out of early access. */
export function TemplateGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {flowTemplates.map((template, i) => (
        <article key={template.title} className="overflow-hidden surface">
          <div className="relative aspect-[16/9]">
            <Image
              src={template.image}
              alt=""
              fill
              // The first row is the largest image on the page, so it shouldn't wait on lazy loading.
              loading={i < 4 ? "eager" : "lazy"}
              sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
              style={{ objectPosition: template.position }}
            />
          </div>
          <div className="p-3.5">
            <h3 className="text-[14.5px] font-semibold text-fg">{template.title}</h3>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">{template.description}</p>
            <ol className="mt-3 flex flex-wrap items-center gap-1 text-[12px] text-muted">
              {findModels(template.slugs).map((model, i) => (
                <li key={model.slug} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3 text-subtle" />}
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-1.5 py-0.5">
                    <ModelArt model={model} className="size-3.5 rounded" />
                    {model.name}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </article>
      ))}
    </div>
  );
}
