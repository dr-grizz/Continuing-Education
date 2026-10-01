"use client";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
const theme = createTheme({
  palette: {
    primary: { main: "#17364b" },
    secondary: { main: "#80601e" },
    background: { default: "#f7f8fa", paper: "#ffffff" },
    text: { primary: "#1c2b36", secondary: "#52616d" },
  },
  typography: {
    fontFamily: "Arial, Helvetica, sans-serif",
    h3: { fontWeight: 700, letterSpacing: "-.7px" },
    h4: { fontWeight: 700, letterSpacing: "-.5px" },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 6 },
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
        input: {
          "&::placeholder": { color: "#52616d", opacity: 1 },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: { notchedOutline: { borderColor: "#7c8791" } },
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
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
