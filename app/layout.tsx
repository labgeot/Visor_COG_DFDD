import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"

export const metadata: Metadata = {
  title: "DGIWG Feature Data Dictionary (DFDD) — Baseline 2013-1.00",
  description:
    "Interactive viewer for the Defence Geospatial Information Working Group (DGIWG) Feature Data Dictionary (DFDD) Baseline 2013-1.00 — ISO 19126 / ISO 19135 / ISO 19110",
  generator: "Next.js 14",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable} antialiased`}>{children}</body>
    </html>
  )
}
