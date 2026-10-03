"use client";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
// Fixed brand surfaces (header, spotlight) stay navy in both color schemes.
export const brand = {
  navy: "#17364b",
  navyHover: "#1f4560",
  gold: "#d8b75d",
  onNavy: "#ffffff",
  onNavyMuted: "#e2e8ed",
  goldOnNavy: "#e7d99b",
};
const theme = createTheme({
  // Follows the operating system light/dark preference via CSS media query.
  cssVariables: { colorSchemeSelector: "media" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: brand.navy },
        secondary: { main: "#80601e" },
        background: { default: "#f7f8fa", paper: "#ffffff" },
        text: { primary: "#1c2b36", secondary: "#52616d" },
        divider: "#dde2e7",
      },
    },
    dark: {
      palette: {
        primary: { main: "#9cc3df", contrastText: "#0d1b25" },
        secondary: { main: "#d8b75d" },
        background: { default: "#0f171f", paper: "#17222c" },
        text: { primary: "#e6edf2", secondary: "#a9b6c1" },
        divider: "#2c3a46",
      },
    },
  },
  typography: {
    fontFamily: "var(--font-sans), system-ui, -apple-system, sans-serif",
    h3: { fontWeight: 700, letterSpacing: "-.02em" },
    h4: { fontWeight: 700, letterSpacing: "-.015em" },
    h5: { fontWeight: 600, letterSpacing: "-.01em" },
    h6: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ":focus-visible, .Mui-focusVisible": {
          outline: "3px solid currentColor !important",
          outlineOffset: "3px",
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
      },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiTextField: { defaultProps: { size: "small" } },
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
