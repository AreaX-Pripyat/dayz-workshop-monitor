import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const MODS_FILE = "mods.json";
const STATE_FILE = "state/workshop-state.json";
const STEAM_DETAILS_URL =
  "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function formatSteamDate(unixSeconds) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Warsaw"
  }).format(new Date(unixSeconds * 1000));
}

async function fetchWorkshopDetails(mods) {
  const body = new URLSearchParams();
  body.set("itemcount", String(mods.length));
  mods.forEach((mod, index) => {
    body.set(`publishedfileids[${index}]`, mod.id);
  });

  const response = await fetch(STEAM_DETAILS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    fail(`Steam API returned HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.response?.publishedfiledetails ?? [];
}

function buildDiscordEmbeds(updates) {
  return updates.map((update) => ({
    title: "Steam Workshop: Mod Update Detected",
    description: `**${update.name}** has been updated on Steam Workshop.`,
    color: 0x5865f2,
    fields: [
      {
        name: "Workshop ID",
        value: update.id,
        inline: true
      },
      {
        name: "Updated",
        value: formatSteamDate(update.timeUpdated),
        inline: true
      },
      {
        name: "Link",
        value: `https://steamcommunity.com/sharedfiles/filedetails/?id=${update.id}`
      }
    ],
    footer: {
      text: "Players should update their local mods before joining the server."
    }
  }));
}

async function sendDiscordNotification(updates) {
  if (!WEBHOOK_URL) {
    fail("Missing DISCORD_WEBHOOK_URL secret.");
  }

  const embeds = buildDiscordEmbeds(updates);

  for (let index = 0; index < embeds.length; index += 10) {
    const batch = embeds.slice(index, index + 10);
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        username: "DayZ Workshop Monitor",
        content: "Steam Workshop mod update detected.",
        embeds: batch
      })
    });

    if (!response.ok) {
      const text = await response.text();
      fail(`Discord webhook returned HTTP ${response.status}: ${text}`);
    }
  }
}

const mods = await readJson(MODS_FILE, []);

if (!Array.isArray(mods) || mods.length === 0) {
  fail("Add at least one mod to mods.json.");
}

const normalizedMods = mods.map((mod) => ({
  id: String(mod.id).trim(),
  name: String(mod.name ?? "").trim()
}));

if (normalizedMods.some((mod) => !/^\d+$/.test(mod.id))) {
  fail("Every mod in mods.json must have a numeric Steam Workshop id.");
}

const previousState = await readJson(STATE_FILE, {});
const details = await fetchWorkshopDetails(normalizedMods);
const detailsById = new Map(details.map((detail) => [String(detail.publishedfileid), detail]));
const nextState = {};
const updates = [];

for (const mod of normalizedMods) {
  const detail = detailsById.get(mod.id);
  if (!detail || Number(detail.result) !== 1) {
    console.warn(`Could not read Workshop item ${mod.id}. Steam result: ${detail?.result ?? "missing"}`);
    continue;
  }

  const name = mod.name || detail.title || mod.id;
  const timeUpdated = Number(detail.time_updated);

  nextState[mod.id] = {
    name,
    title: detail.title,
    timeUpdated
  };

  const previous = previousState[mod.id];
  if (previous && Number(previous.timeUpdated) !== timeUpdated) {
    updates.push({
      id: mod.id,
      name,
      timeUpdated,
      previousTimeUpdated: Number(previous.timeUpdated)
    });
  }
}

await mkdir(dirname(STATE_FILE), { recursive: true });
await writeFile(STATE_FILE, `${JSON.stringify(nextState, null, 2)}\n`);

if (updates.length === 0) {
  console.log("No Workshop updates detected.");
} else {
  await sendDiscordNotification(updates);
  console.log(`Sent ${updates.length} update notification(s).`);
}
