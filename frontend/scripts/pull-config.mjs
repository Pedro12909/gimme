// Writes public/config.json from the deployed WishlistStack outputs, for local development.
// Usage: npm run config:pull
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const region = process.env.AWS_REGION ?? "eu-west-2";
const outputs = JSON.parse(
  execFileSync("aws", [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    "WishlistStack",
    "--region",
    region,
    "--query",
    "Stacks[0].Outputs",
    "--output",
    "json",
  ]).toString(),
);

const value = (key) => {
  const output = outputs.find((o) => o.OutputKey === key);
  if (!output) throw new Error(`Stack output ${key} not found`);
  return output.OutputValue;
};

const config = {
  apiUrl: value("WishlistAPIUrl"),
  userPoolId: value("PoolID"),
  userPoolClientId: value("PoolClientID"),
};

writeFileSync(
  new URL("../public/config.json", import.meta.url),
  JSON.stringify(config, null, 2) + "\n",
);
console.log("Wrote public/config.json", config);
