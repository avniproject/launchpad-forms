import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Box, Container } from "@mui/material";
import { LaunchpadForm } from "@/pages/LaunchpadForm";
import { NoFormScreen } from "@/pages/NoFormScreen";

// A form is reachable only at /<code>; the bare domain serves nothing. The
// code -> form mapping lives server-side in server/src/forms/registry.ts, so
// adding a form is a new entry there, not a new route here.
function Bare() {
  return (
    <Box sx={{ py: { xs: 4, sm: 8 } }}>
      <Container maxWidth="sm">
        <NoFormScreen />
      </Container>
    </Box>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Bare />} />
        <Route path="/:code" element={<LaunchpadForm />} />
        <Route path="*" element={<Bare />} />
      </Routes>
    </BrowserRouter>
  );
}
