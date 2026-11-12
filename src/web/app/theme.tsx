"use client";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
// Fixed brand surfaces (header, spotlight) stay navy in both color schemes.
export const brand = {
  navy: "#003a63",
  navyHover: "#002b4a",
  gold: "#fdb813",
  onNavy: "#ffffff",
  onNavyMuted: "#e2e8ed",
  goldOnNavy: "#fdb813",
};
const theme = createTheme({
  // Light or dark comes from a class on <html>, set by the header's theme
  // switch (components/theme-switch.tsx); "Match device" follows the
  // operating system preference and is the default.
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: brand.navy },
        secondary: { main: brand.navy },
        background: { default: "#f7f8fa", paper: "#ffffff" },
        text: { primary: "#1c2b36", secondary: "#52616d" },
        divider: "#dde2e7",
      },
    },
    dark: {
      palette: {
        primary: { main: "#9cc3df", contrastText: "#0d1b25" },
        secondary: { main: "#fdb813" },
        // MUI's default dark red (#f44336) is 4.4:1 on paper; this is 6.7:1 and
        // keeps 7.3:1 with dark text on contained error buttons.
        error: { main: "#f28b82", contrastText: "#0d1b25" },
        background: { default: "#0f171f", paper: "#17222c" },
        text: { primary: "#e6edf2", secondary: "#a9b6c1" },
        divider: "#2c3a46",
      },
    },
  },
  typography: {
    fontFamily:
      'var(--font-sans, "myriad-pro", "Helvetica Neue", Tahoma, Arial, sans-serif)',
    body1: { lineHeight: 1.6 },
    h1: { fontWeight: 700, textTransform: "uppercase", lineHeight: 1.15 },
    h2: { fontWeight: 700, textTransform: "uppercase", lineHeight: 1.2 },
    h3: { fontWeight: 700, textTransform: "uppercase", lineHeight: 1.2 },
    h4: { fontWeight: 700, textTransform: "uppercase", lineHeight: 1.2 },
    h5: { fontWeight: 700, lineHeight: 1.3 },
    h6: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 700 },
  },
  shape: { borderRadius: 4 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ":focus-visible, .Mui-focusVisible": {
          outline: "3px solid currentColor !important",
          outlineOffset: "3px",
        },
        // Tab rows clip overflow, so tabs draw their focus ring inside.
        ".MuiTab-root.Mui-focusVisible": { outlineOffset: "-3px" },
        // Text fields and selects show focus with their own thicker border
        // (MuiOutlinedInput below); an outline here would cover the label.
        ".MuiInputBase-input:focus-visible": { outline: "none !important" },
        // The rich text editor's writing area: its field border shows focus,
        // so a ring inside it would draw a second rectangle.
        ".ProseMirror:focus-visible": { outline: "none !important" },
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animation: "none !important",
            transition: "none !important",
            scrollBehavior: "auto !important",
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        input: ({ theme }) => ({
          "&::placeholder": { color: "#52616d", opacity: 1 },
          ...theme.applyStyles("dark", {
            "&::placeholder": { color: "#a9b6c1", opacity: 1 },
          }),
        }),
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: ({ theme }) => ({
          borderColor: "#7c8791",
          ...theme.applyStyles("dark", { borderColor: "#71808c" }),
        }),
        // Focus: the existing border turns the primary color and thickens
        // from 1px to 3px (2px for dropdowns), instead of a second rectangle.
        root: {
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderWidth: 3 },
          // Dropdowns are compact, so their focused border is 2px.
          "&.Mui-focused:has(.MuiSelect-select) .MuiOutlinedInput-notchedOutline":
            { borderWidth: 2 },
        },
      },
    },
    // Windows High Contrast and other forced-color modes drop backgrounds, so
    // states shown only by a fill get a system color or a border instead.
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 0 },
        outlined: { borderWidth: 2, "&:hover": { borderWidth: 2 } },
        contained: {
          "@media (forced-colors: active)": { border: "1px solid ButtonText" },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          "@media (forced-colors: active)": {
            "&.Mui-selected": {
              forcedColorAdjust: "none",
              backgroundColor: "Highlight",
              color: "HighlightText",
            },
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          "@media (forced-colors: active)": {
            "&.Mui-selected": {
              forcedColorAdjust: "none",
              backgroundColor: "Highlight",
              color: "HighlightText",
            },
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          "@media (forced-colors: active)": {
            forcedColorAdjust: "none",
            backgroundColor: "Highlight",
          },
        },
      },
    },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiTextField: { defaultProps: { size: "small" } },
    // Helper text on a disabled field explains why it is locked, so it keeps
    // readable contrast instead of MUI's faded disabled color.
    MuiFormHelperText: {
      styleOverrides: {
        root: ({ theme }) => ({
          "&.Mui-disabled": {
            color: (theme.vars ?? theme).palette.text.secondary,
          },
        }),
      },
    },
    MuiChip: { defaultProps: { size: "small" } },
    MuiLink: { defaultProps: { underline: "hover" } },
  },
});
export default function Theme({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}
