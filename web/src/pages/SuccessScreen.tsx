import { Box, Button, Paper, Typography } from "@mui/material";

interface Props {
  reference: string;
  cohort: string;
}

export function SuccessScreen({ reference, cohort }: Props) {
  return (
    <Paper
      elevation={0}
      sx={{
        bgcolor: "#ffffff",
        borderRadius: "16px",
        boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
        p: { xs: 3, sm: 5 },
        textAlign: "center",
      }}
    >
      <Box
        sx={{
          width: 96,
          height: 96,
          borderRadius: "50%",
          bgcolor: "#48BB78",
          color: "#fff",
          fontSize: 48,
          lineHeight: "96px",
          mx: "auto",
          mb: 3,
        }}
      >
        ✓
      </Box>
      <Typography variant="h5" sx={{ mb: 1 }}>
        Application received
      </Typography>
      <Typography sx={{ color: "text.secondary", fontSize: 15, mb: 3 }}>
        Thank you for applying to <strong>{cohort}</strong>. The Launchpad team will review your application and
        reach out over email or WhatsApp.
      </Typography>
      <Typography sx={{ fontSize: 14, mb: 0.5 }}>Your reference</Typography>
      <Typography sx={{ fontFamily: "monospace", fontSize: 22, fontWeight: 600, mb: 3 }}>{reference}</Typography>
      <Typography sx={{ color: "text.secondary", fontSize: 13, mb: 3 }}>
        Need to change an answer? Submit the form again with the same email address — it updates your existing
        application.
      </Typography>
      <Button variant="contained" href="https://avniproject.org" sx={{ borderRadius: "8px", fontWeight: 600 }}>
        Explore Avni
      </Button>
    </Paper>
  );
}
