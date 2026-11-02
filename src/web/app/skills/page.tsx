import { Suspense } from "react";
import { Stack, Typography } from "@mui/material";
import { CredentialTools } from "../../components/credential-tools";
import { LoadingCards } from "../../components/loading";
export default function SkillsPage() {
  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h4">
        Skills and career explorer
      </Typography>
      <Typography>
        Explore skill definitions, related occupations, wages and national
        employment outlook. This information is free to view and requires no
        account.
      </Typography>
      <Suspense fallback={<LoadingCards label="Loading skills and careers" />}>
        <CredentialTools tool="skills" />
      </Suspense>
    </Stack>
  );
}
