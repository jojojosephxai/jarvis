import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jarvis",
  description: "A personal assistant with a face, a brain, and hands that leave a receipt.",
};

export const viewport: Viewport = {
  themeColor: "#141210",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
