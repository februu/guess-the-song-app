import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";

// Load Montserrat from Google Fonts with the weights used across the app,
// and expose it as the --font-sans CSS variable for Tailwind
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

// Page metadata shown in the browser tab and search engines
export const metadata: Metadata = {
  title: "Muzzly",
  description: "Guess songs with your friends!",
};

// Root layout — wraps every page in the app
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning // prevents hydration mismatch caused by next-themes injecting the theme class
      className={`${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* ThemeProvider enables light/dark mode via a "class" attribute on <html> */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}