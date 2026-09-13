import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/Navbar";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "TripPool — Plan trips, explore, and settle up together",
  description: "Plan trips with your group: itinerary, stays, food, top attractions, and expense splitting.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="font-body min-h-screen flex flex-col">
        <Providers>
          <Navbar />
          <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
