import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/app/context/AuthContext";

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
      <body className="antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
