import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/app/context/AuthContext";
import { RuntimeResilience } from "@/app/components/runtime-resilience";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "Speech-Enabled BPO Training Platform | St. Peter Velle Technical Training Center, Inc.",
  description: "Speech-enabled language assessment, microlearning, coaching, and certification workflow for St. Peter Velle Technical Training Center, Inc.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <RuntimeResilience />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
