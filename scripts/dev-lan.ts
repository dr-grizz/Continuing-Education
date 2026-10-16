import { spawn } from "node:child_process";
import os from "node:os";
// Runs the prototype for other devices on the local network. Only the website
// listens on the network; it proxies to the API, which stays on loopback with
// the database. Mock sign-in has no passwords, so use a trusted
// network only.
const address = Object.values(os.networkInterfaces())
  .flat()
  .find(
    (net) =>
      net?.family === "IPv4" &&
      !net.internal &&
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(net.address),
  )?.address;
if (!address) {
  console.error("No private network address found. Is Wi-Fi connected?");
  process.exit(1);
}
const url = `http://${address}:3050`;
console.log(`Website on the local network: ${url}`);
const child = spawn(
  "npx",
  [
    "concurrently",
    "-k",
    "-n",
    "web,api",
    "next dev src/web --hostname 0.0.0.0 --port 3050",
    "npm run dev:api",
  ],
  {
    stdio: "inherit",
    // LAN_HOST lets Next.js serve dev assets to that address; WEB_URL sends
    // learners back from Stripe Checkout to the address they came from.
    env: { ...process.env, LAN_HOST: address, WEB_URL: url },
  },
);
child.on("exit", (code) => process.exit(code ?? 0));
