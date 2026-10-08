import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { playgroundHref } from "@/features/models/lib/links";
import { formatPrice } from "@/lib/format";
import { discounted } from "@/lib/pricing";
import { promo } from "@/mocks/dashboard";
import { getModel } from "@/mocks/models";

export function PromoCard() {
  const model = getModel(promo.slug);

  return (
    <Link
      href={playgroundHref(model.slug)}
      className="group relative isolate flex min-h-[300px] flex-col justify-end overflow-hidden rounded-[var(--radius-card)] border border-line p-6 sm:p-7"
    >
      <Image
        src={promo.image}
        alt=""
        fill
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="-z-10 object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.04]"
        style={{ objectPosition: promo.position }}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[rgb(0_0_0/0.82)] via-[rgb(0_0_0/0.4)] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-[rgb(0_0_0/0.5)] to-transparent" />

      <p className="text-[13px] font-medium text-[rgb(255_255_255/0.7)]">{promo.eyebrow}</p>
      <h2 className="mt-1.5 max-w-[15ch] text-[clamp(26px,2.4vw,38px)] leading-[1.04] font-semibold tracking-[-0.035em] text-[#fff]">
        {promo.title}
      </h2>
      <p className="mt-2.5 max-w-sm text-[14px] leading-relaxed text-[rgb(255_255_255/0.75)] tabular">
        <s className="text-[rgb(255_255_255/0.45)]">{formatPrice(model.price)}</s>{" "}
        <span className="font-semibold text-[#fff]">{formatPrice(discounted(model))}</span> per {model.unit} until {promo.until}. Same
        endpoint, no code changes.
      </p>
      <span className="mt-4 inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-[#fff] px-4 text-[14px] font-medium text-[#0b0c0f] transition group-hover:bg-[rgb(255_255_255/0.88)]">
        Try {model.name} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
