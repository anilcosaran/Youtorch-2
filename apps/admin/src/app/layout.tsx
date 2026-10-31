import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { SIDEBAR_BOOT_SCRIPT } from "@/components/layout/sidebar-state";
import { ConfirmProvider } from "@/components/shared/confirm";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BRAND } from "@/lib/brand";
import { QueryProvider } from "@/lib/query-client";
import "./globals.css";

// Inter keeps small text crisp on every platform, Windows included.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: BRAND.name,
    template: `%s · ${BRAND.name}`,
  },
  description: "Operator console for Modelvend: catalog, providers, customers and tasks.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOT_SCRIPT }} />
      </head>
      {/* Extensions such as ColorZilla add attributes to <body> before React loads. */}
      <body className="h-full" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <QueryProvider>
            <TooltipProvider delayDuration={200}>
              <ConfirmProvider>{children}</ConfirmProvider>
            </TooltipProvider>
          </QueryProvider>
          <Toaster position="top-center" offset={10} visibleToasts={3} />
        </ThemeProvider>
      </body>
    </html>
  );
}
