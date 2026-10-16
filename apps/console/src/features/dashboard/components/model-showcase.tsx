import { SectionHeader, SectionLink } from "@/components/ui/section-header";
import { ModelCard } from "@/features/models/components/model-card";
import { topModels } from "@/mocks/dashboard";
import { getModel, models } from "@/mocks/models";

export function ModelShowcase() {
  return (
    <section>
      <SectionHeader
        title="Top models"
        description={`The most-called models this week. ${models.length - topModels.length} more behind the same endpoint.`}
        action={<SectionLink href="/models">View all</SectionLink>}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {topModels.map((top, i) => (
          <ModelCard
            key={top.slug}
            model={getModel(top.slug)}
            cover={{ src: top.image, position: top.position }}
            className="animate-fade-up"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
    </section>
  );
}
