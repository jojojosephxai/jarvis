import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";

import "./globals.css";
import "./graph-read.css";
import "./mark.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jarvis",
  description: "Jarvis Face. A near-black screen with a cyan orb in the middle.",
  appleWebApp: {
    capable: true,
    title: "Jarvis",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#030508",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} dark h-full antialiased`}>
      <body className="min-h-full">
        <Script id="jarvis-boot" strategy="beforeInteractive">
          {`try{if(sessionStorage.getItem("jarvis-boot")==="1"){document.documentElement.dataset.boot="done"}}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
