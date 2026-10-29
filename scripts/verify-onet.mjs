import "dotenv/config";
import { OnetService } from "../badge-service/onet.mjs";
const service = new OnetService();
try {
  const { data } = await service.call("about");
  const search = await service.search({ query: "instructional designer" });
  if (!search.occupations.length)
    throw new Error("No test occupation returned.");
  const outlook = await service.outlook(search.occupations[0].code);
  console.log(
    JSON.stringify(
      {
        apiVersion: data.api_version,
        occupations: search.occupations.length,
        sample: search.occupations[0],
        nationalOutlook: outlook.outlook,
        retrievedAt: outlook.retrievedAt,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
