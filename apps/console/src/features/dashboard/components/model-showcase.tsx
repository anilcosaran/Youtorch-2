import { SectionHeader, SectionLink } from "@/components/ui/section-header";
import { ModelCard } from "@/features/models/components/model-card";
import { topModels } from "@/mocks/dashboard";
import { findModel, models } from "@/mocks/models";

export function ModelShowcase() {
  const top = topModels.flatMap((t) => {
    const model = findModel(t.slug);
    return model ? [{ ...t, model }] : [];
  });
  if (!top.length) return null;

  return (
    <section>
      <SectionHeader
        title="Top models"
        description={`The most-called models this week. ${models.length - top.length} more behind the same endpoint.`}
        action={<SectionLink href="/models">View all</SectionLink>}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {top.map(({ model, image, position }, i) => (
          <ModelCard
            key={model.slug}
            model={model}
            cover={{ src: image, position }}
            className="animate-fade-up"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
    </section>
  );
}
