import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash, createPrivateKey, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fitTrack = join(root, "julienfitnessapp");
const source = join(fitTrack, "source");
const output = resolve(process.env.FITTRACK_RELEASE_OUTPUT ?? join(root, ".fittrack-release"));
const bundleWeb = join(output, "web");
const bundleDir = join(output, "bundles");

const webVersion = (await readFile(join(fitTrack, "version.txt"), "utf8")).trim();
if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(webVersion)) {
  throw new Error("julienfitnessapp/version.txt must contain a version such as 1.0.1");
}
if (!process.env.FITTRACK_WEB_RELEASE_PRIVATE_KEY) {
  throw new Error("The FITTRACK_WEB_RELEASE_PRIVATE_KEY GitHub Secret is missing.");
}

await rm(output, { recursive: true, force: true });
await mkdir(bundleDir, { recursive: true });
await cp(source, bundleWeb, { recursive: true });
await readFile(join(bundleWeb, "index.html"), "utf8"); // clear error if the entry point is missing

const bootstrapName = "fittrack-shell-bootstrap.js";
await cp(join(fitTrack, bootstrapName), join(bundleWeb, bootstrapName));
await injectBootstrap(join(bundleWeb, "index.html"), bootstrapName);
await writeFile(join(bundleWeb, "release-info.json"), `${JSON.stringify({ webVersion, bridgeVersion: 1 })}\n`);

const bundleName = `fitness-web-${webVersion}.zip`;
const bundlePath = join(bundleDir, bundleName);
execFileSync("zip", ["-X", "-r", bundlePath, "."], { cwd: bundleWeb, stdio: "inherit" });
const bundleSha256 = createHash("sha256").update(await readFile(bundlePath)).digest("hex");

const unsignedManifest = {
  schemaVersion: 1,
  webVersion,
  buildNumber: Date.now(),
  releasedAt: new Date().toISOString(),
  minimumShellVersion: 1,
  maximumShellVersion: null,
  bundleUrl: `bundles/${bundleName}`,
  bundleSha256,
  entryPoint: "index.html",
  mandatory: false
};
const key = createPrivateKey(process.env.FITTRACK_WEB_RELEASE_PRIVATE_KEY.replace(/\\n/g, "\n"));
if (key.asymmetricKeyType !== "ed25519") throw new Error("The release secret must be an Ed25519 private key.");
const manifest = {
  ...unsignedManifest,
  signature: sign(null, Buffer.from(canonicalJson(unsignedManifest), "utf8"), key).toString("base64")
};
await writeFile(join(output, "app-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Prepared signed FitTrack web release ${webVersion}`);

async function injectBootstrap(indexPath, fileName) {
  const html = await readFile(indexPath, "utf8");
  if (html.includes(fileName)) return;
  const tag = `  <script type="module" src="./${fileName}"></script>\n`;
  const closingBody = /<\/body\s*>/i;
  if (!closingBody.test(html)) throw new Error("source/index.html must contain a closing </body> tag.");
  await writeFile(indexPath, html.replace(closingBody, `${tag}</body>`));
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new TypeError("Manifest values must be JSON values.");
}
