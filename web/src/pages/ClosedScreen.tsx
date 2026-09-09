import { Button, Paper, Typography } from "@mui/material";

interface Props {
  closesAt: string;
}

export function ClosedScreen({ closesAt }: Props) {
  const when = new Date(closesAt);
  const formatted = Number.isNaN(when.getTime())
    ? null
    : when.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

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
      <Typography variant="h5" sx={{ mb: 1 }}>
        Applications are closed
      </Typography>
      <Typography sx={{ color: "text.secondary", fontSize: 15, mb: 3 }}>
        {formatted
          ? `Applications for this cohort closed on ${formatted}.`
          : "Applications for this cohort are currently closed."}{" "}
        Keep an eye on the Avni website for the next Launchpad cohort.
      </Typography>
      <Button variant="contained" href="https://avniproject.org" sx={{ borderRadius: "8px", fontWeight: 600 }}>
        Visit avniproject.org
      </Button>
    </Paper>
  );
}
