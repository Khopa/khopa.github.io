// Fetch the latest MotMot Advance release ROM into apps/motmot/ (GitHub
// release assets are not served with CORS headers, so the browser page
// cannot load them directly). Run: npm run update:motmot
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(rootDir, "apps", "motmot", "Mot.Mot.Advance.gba");

const release = await (await fetch("https://api.github.com/repos/Khopa/motmot-advance/releases/latest")).json();
const asset = (release.assets ?? []).find((a) => a.name.toLowerCase().endsWith(".gba"));
if (!asset) throw new Error("no .gba asset in the latest release");
const rom = await (await fetch(asset.browser_download_url)).arrayBuffer();
await fs.writeFile(target, Buffer.from(rom));
console.log(`${release.tag_name}: ${asset.name} (${rom.byteLength} bytes) -> ${path.relative(rootDir, target)}`);
