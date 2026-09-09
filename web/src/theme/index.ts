import { createTheme } from "@mui/material/styles";

// Visual language of avniproject.org/signup: brand orange, white cards with
// generous radius, sentence-case buttons.
export const theme = createTheme({
  palette: {
    primary: { main: "#ff470f" },
    secondary: { main: "#64748b" },
    background: { default: "#f3f4f6" },
    text: { primary: "#2D3748", secondary: "#718096" },
  },
  typography: {
    fontFamily: ["-apple-system", "BlinkMacSystemFont", "Inter", "Segoe UI", "Roboto", "sans-serif"].join(","),
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 16 },
  components: {
    // Stop SHOUTING. MUI default uppercases all button labels which clashes
    // with the rest of the (sentence-case) UI.
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none" },
      },
    },
    // A radius of 16 suits the cards but makes small inputs look pill-shaped.
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
  },
});
