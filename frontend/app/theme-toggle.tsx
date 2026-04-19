"use client"; 

// This component renders a button that toggles between light and dark themes.
// When clicked, it switches the current theme using next-themes.
// It visually indicates the current mode by showing a sun icon (light mode)
// or a moon icon (dark mode), with smooth transitions between them.

import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes"; // hook for managing theme
import { FaMoon, FaSun } from "react-icons/fa6"; // icons

export function ThemeToggle() {
    const { theme, setTheme } = useTheme(); // current theme and setter

    return (
        <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} // toggle theme
        >
            {/* Sun icon - visible in light mode */}
            <FaSun className="absolute h-10 w-10 rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />

            {/* Moon icon - visible in dark mode */}
            <FaMoon className="absolute h-10 w-10 rotate-90 scale-0 dark:-rotate-0 dark:scale-100" />
        </Button>
    );
}