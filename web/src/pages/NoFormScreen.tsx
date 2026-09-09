import { Box, Link, Paper, Typography } from "@mui/material";

// Shown for the bare domain and for any code that does not resolve. The two
// are deliberately identical: a visitor cannot tell a mistyped code from a
// retired one, so codes cannot be probed for validity.
export function NoFormScreen() {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: "16px",
        boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
        p: { xs: 3, sm: 5 },
        textAlign: "center",
      }}
    >
      <Box sx={{ py: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          No form here
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 520, mx: "auto" }}>
          This link does not open an application form. If you were sent one, check that you
          copied the whole address — it ends in a short code.
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          <Link href="https://avniproject.org" target="_blank" rel="noopener">
            avniproject.org
          </Link>
        </Typography>
      </Box>
    </Paper>
  );
}
