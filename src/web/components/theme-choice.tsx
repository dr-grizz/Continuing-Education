"use client";
import {
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Typography,
} from "@mui/material";
import { useColorScheme } from "@mui/material/styles";

// Light, dark or the device's setting (the default). MUI remembers the choice
// in this browser's storage, and InitColorSchemeScript (app/layout.tsx) applies
// it before the page paints, so there is no flash of the other theme.
const options = [
  {
    mode: "system",
    label: "Match device",
    hint: "Follows your computer or phone's light or dark setting.",
  },
  { mode: "light", label: "Light", hint: "Dark text on a light background." },
  { mode: "dark", label: "Dark", hint: "Light text on a dark background." },
] as const;

export function ThemeChoice() {
  const { mode, setMode } = useColorScheme();
  return (
    <FormControl>
      <FormLabel id="theme-choice-label" sx={{ fontWeight: 600, mb: 1 }}>
        Color theme
      </FormLabel>
      <RadioGroup
        aria-labelledby="theme-choice-label"
        aria-describedby="theme-choice-note"
        // `mode` is unknown until the page has loaded in the browser.
        value={mode ?? ""}
        onChange={(event) =>
          setMode(event.target.value as (typeof options)[number]["mode"])
        }
      >
        {options.map((option) => (
          <FormControlLabel
            key={option.mode}
            value={option.mode}
            control={<Radio />}
            sx={{ alignItems: "flex-start", mb: 1 }}
            label={
              <>
                <Typography sx={{ pt: 1 }}>{option.label}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {option.hint}
                </Typography>
              </>
            }
          />
        ))}
      </RadioGroup>
      <Typography id="theme-choice-note" variant="body2" color="text.secondary">
        Applies right away and is remembered in this browser.
      </Typography>
    </FormControl>
  );
}
