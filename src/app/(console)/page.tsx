import type { Metadata } from "next";
import { BuildBanner } from "@/features/dashboard/components/build-banner";
import { Featured } from "@/features/dashboard/components/featured/featured";
import { Gallery } from "@/features/dashboard/components/gallery/gallery";
import { ModelShowcase } from "@/features/dashboard/components/model-showcase";
import { RecentRequests } from "@/features/dashboard/components/recent-requests";
import { ShowcaseSlider } from "@/features/dashboard/components/showcase/showcase-slider";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <div className="-mx-4 -mt-[88px] sm:-mx-6 lg:-mx-8 lg:-mt-8">
        <ShowcaseSlider />
      </div>
      <div className="mt-4 space-y-12">
        <Featured />
        <Gallery />
        <BuildBanner />
        <ModelShowcase />
        <RecentRequests />
      </div>
    </>
  );
}
