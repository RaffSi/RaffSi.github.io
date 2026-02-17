// Where YOU will place the PNGs:
const PNG_DIR = "/img/arcade/";

// If you want to add more later, just append entries here.
// NOTE: Filenames MUST match exactly what you save.
const ARCADE_MODES = [
  { id: "roadhog_catch_a_mari", name: "Roadhog’s Catch-a-Mari", filename: "roadhog-catch-a-mari.png" },
  { id: "deathmatch",          name: "Deathmatch (FFA)",        filename: "deathmatch.png" },
  { id: "team_deathmatch",     name: "Team Deathmatch",         filename: "team-deathmatch.png" },
  { id: "low_gravity",         name: "Low Gravity",             filename: "low-gravity.png" },
  { id: "bounty_hunter",       name: "Bounty Hunter",           filename: "bounty-hunter.png" },
  { id: "capture_the_flag",    name: "Capture the Flag",        filename: "capture-the-flag.png" },
  { id: "ctf_blitz",           name: "CTF Blitz",               filename: "ctf-blitz.png" },
  { id: "no_limits",           name: "No Limits",               filename: "no-limits.png" },

  // Common Arcade rotations (uncomment if you want PNGs for these too):
  // { id: "mystery_heroes",      name: "Mystery Heroes",          filename: "mystery-heroes.png" },
  // { id: "total_mayhem",        name: "Total Mayhem",            filename: "total-mayhem.png" },
  // { id: "elimination_3v3",     name: "3v3 Elimination",         filename: "3v3-elimination.png" },
  // { id: "elimination_6v6",     name: "6v6 Elimination",         filename: "6v6-elimination.png" },
  // { id: "assault_maps",        name: "Assault Maps",            filename: "assault-maps.png" },
];

const grid = document.getElementById("grid");
const search = document.getElementById("search");
const sort = document.getElementById("sort");
const count = document.getElementById("count");

function makeTile(mode){
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.dataset.id = mode.id;
  tile.dataset.name = mode.name.toLowerCase();
  tile.dataset.filename = mode.filename.toLowerCase();

  const iconWrap = document.createElement("div");
  iconWrap.className = "iconWrap";

  const img = document.createElement("img");
  img.className = "icon";
  img.alt = mode.name;
  img.loading = "lazy";
  img.src = PNG_DIR + mode.filename;

  const fallback = document.createElement("div");
  fallback.className = "fallback";
  fallback.textContent = "PNG missing — add: " + mode.filename;

  img.addEventListener("error", () => {
    tile.classList.add("missing");
  });

  iconWrap.appendChild(img);
  iconWrap.appendChild(fallback);

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = mode.name;

  const file = document.createElement("div");
  file.className = "file";
  file.textContent = mode.filename;

  tile.appendChild(iconWrap);
  tile.appendChild(label);
  tile.appendChild(file);

  return tile;
}

function getSorted(list){
  const mode = sort?.value || "custom";
  const arr = [...list];

  if (mode === "az"){
    arr.sort((a,b) => a.name.localeCompare(b.name));
  } else if (mode === "za"){
    arr.sort((a,b) => b.name.localeCompare(a.name));
  } else {
    // "custom" keeps your defined order
  }
  return arr;
}

function render(){
  const q = (search?.value || "").trim().toLowerCase();
  const filtered = ARCADE_MODES.filter(m => {
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.filename.toLowerCase().includes(q)
    );
  });

  const sorted = getSorted(filtered);

  grid.innerHTML = "";
  for(const m of sorted){
    grid.appendChild(makeTile(m));
  }

  count.textContent = `${sorted.length} mode(s) shown`;
}

search?.addEventListener("input", render);
sort?.addEventListener("change", render);

render();
