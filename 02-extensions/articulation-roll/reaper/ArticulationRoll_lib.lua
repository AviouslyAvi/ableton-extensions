--[[
  ArticulationRoll — shared engine library.
  Ported 1:1 from ../src/extension.ts (artForMelodicNotes + keyswitchesFromNotes).

  This file holds no UI and never runs on its own. The front-end scripts load it:

      local sep   = package.config:sub(1, 1)
      local here  = ({reaper.get_action_context()})[2]:match("(.*" .. sep .. ")")
      local ART   = dofile(here .. "ArticulationRoll_lib.lua")
      ART.run("menu")           -- or "slot"/"clear"/"rebuild"

  Keeping the engine in one place means the menu script and every bindable
  per-articulation action share the exact same logic + map.
]]--

local M = {}

--------------------------------------------------------------------------------
-- Constants (beats == quarter notes, as in Live)
--------------------------------------------------------------------------------
local TRIGGER_DURATION = 0.25   -- beats, length of a non-held keyswitch trigger
local KS_PREROLL       = 0.0625 -- beats, nudge keyswitch a hair before its note
local MIN_DURATION     = 1e-4   -- guard against zero/negative lengths
local KS_CHANNEL       = 0      -- 0-based MIDI channel keyswitch notes are written on
local MAP_FILENAME     = "ArticulationRoll_map.txt"

local DEFAULT_MAP = {
  { name = "Sustain",   pitch = 0, velocity = 100, hold = false }, -- C-2
  { name = "Legato",    pitch = 1, velocity = 100, hold = false }, -- C#-2
  { name = "Staccato",  pitch = 2, velocity = 100, hold = false }, -- D-2
  { name = "Spiccato",  pitch = 3, velocity = 100, hold = false }, -- D#-2
  { name = "Pizzicato", pitch = 4, velocity = 100, hold = false }, -- E-2
  { name = "Tremolo",   pitch = 5, velocity = 100, hold = false }, -- F-2
  { name = "Trill",     pitch = 6, velocity = 100, hold = false }, -- F#-2
  { name = "Marcato",   pitch = 7, velocity = 100, hold = false }, -- G-2
}

--------------------------------------------------------------------------------
-- Map persistence (plain text file in the resource path; mirrors articulations.json)
--------------------------------------------------------------------------------
local function mapPath() return reaper.GetResourcePath() .. "/" .. MAP_FILENAME end
M.mapPath = mapPath

local function trim(s) return (s:gsub("^%s*(.-)%s*$", "%1")) end

local function writeDefaultMap()
  local f = io.open(mapPath(), "w")
  if not f then return end
  f:write("# ArticulationRoll map — one articulation per line:\n")
  f:write("#   Name = pitch, velocity, hold\n")
  f:write("# pitch = MIDI note number (0-127) the keyswitch fires on.\n")
  f:write("# hold  = true (latch for the whole region) or false (short trigger).\n")
  f:write("# Order = slot number: the Nth line is assigned by the 'slot N' action.\n\n")
  for _, a in ipairs(DEFAULT_MAP) do
    f:write(string.format("%s = %d, %d, %s\n", a.name, a.pitch, a.velocity, tostring(a.hold)))
  end
  f:close()
end
M.writeDefaultMap = writeDefaultMap

function M.loadMap()
  local f = io.open(mapPath(), "r")
  if not f then writeDefaultMap(); return DEFAULT_MAP end
  local map = {}
  for line in f:lines() do
    local l = trim(line)
    if l ~= "" and l:sub(1, 1) ~= "#" then
      local name, rest = l:match("^(.-)%s*=%s*(.+)$")
      if name and rest then
        local pitch, vel, hold = rest:match("^%s*([%-%d]+)%s*,%s*([%-%d]+)%s*,%s*(%a+)%s*$")
        if pitch then
          map[#map + 1] = {
            name     = trim(name),
            pitch    = math.max(0, math.min(127, tonumber(pitch))),
            velocity = tonumber(vel) or 100,
            hold     = (hold:lower() == "true"),
          }
        end
      end
    end
  end
  f:close()
  if #map == 0 then return DEFAULT_MAP end
  return map
end

function M.openMapFile()
  local path = mapPath()
  if not reaper.file_exists(path) then writeDefaultMap() end
  if reaper.CF_ShellExecute then
    reaper.CF_ShellExecute(path)
  elseif reaper.GetOS():match("Win") then
    os.execute('cmd /c start "" "' .. path .. '"')
  else
    os.execute('open "' .. path .. '"')
  end
  reaper.ShowConsoleMsg("ArticulationRoll map: " .. path .. "\n")
end

--------------------------------------------------------------------------------
-- Bank config (multi-bank; used by the ReaImGui app). Stored as a Lua table so
-- we can load it with load() and serialize it by hand — no JSON dependency.
--   { version = 1, banks = { { name, channel, articulations = { {name,pitch,velocity,hold}, ... } }, ... } }
--------------------------------------------------------------------------------
local BANKS_FILENAME = "ArticulationRoll_banks.lua"

local function banksPath() return reaper.GetResourcePath() .. "/" .. BANKS_FILENAME end
M.banksPath = banksPath

function M.defaultBanks()
  local arts = {}
  for _, a in ipairs(DEFAULT_MAP) do
    arts[#arts + 1] = { name = a.name, pitch = a.pitch, velocity = a.velocity, hold = a.hold }
  end
  return { version = 1, banks = { { name = "Default", channel = 0, articulations = arts } } }
end

function M.loadBanks()
  local f = io.open(banksPath(), "r")
  if not f then
    local d = M.defaultBanks()
    M.saveBanks(d)
    return d
  end
  local src = f:read("*a"); f:close()
  local chunk = load(src, "banks", "t", {})   -- sandboxed: no env, data only
  local ok, data = pcall(chunk)
  if not ok or type(data) ~= "table" or type(data.banks) ~= "table" or #data.banks == 0 then
    return M.defaultBanks()
  end
  return data
end

-- Serialize a bank config table back to a Lua source file.
local function q(s) return '"' .. tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"') .. '"' end

function M.saveBanks(data)
  local f = io.open(banksPath(), "w")
  if not f then return false end
  f:write("-- ArticulationRoll banks — edited by the ArticulationRoll app.\n")
  f:write("return {\n  version = 1,\n  banks = {\n")
  for _, b in ipairs(data.banks) do
    f:write(string.format("    { name = %s, channel = %d, articulations = {\n",
      q(b.name), tonumber(b.channel) or 0))
    for _, a in ipairs(b.articulations) do
      f:write(string.format("      { name = %s, pitch = %d, velocity = %d, hold = %s },\n",
        q(a.name), tonumber(a.pitch) or 0, tonumber(a.velocity) or 100, tostring(a.hold == true)))
    end
    f:write("    }},\n")
  end
  f:write("  },\n}\n")
  f:close()
  return true
end

--------------------------------------------------------------------------------
-- Ported core #1: articulationForMelodic  (was artForMelodicNotes)
--------------------------------------------------------------------------------
local function articulationForMelodic(melodic, keyswitches)
  table.sort(keyswitches, function(a, b) return a.start < b.start end)
  for _, n in ipairs(melodic) do
    local art = nil
    for _, k in ipairs(keyswitches) do
      if k.start <= n.startppq + 1 then art = k.name else break end
    end
    n.art = art
  end
end

--------------------------------------------------------------------------------
-- Ported core #2: keyswitchesFromNotes
--------------------------------------------------------------------------------
local function keyswitchesFromNotes(melodic, map, clipEndPPQ, ppqPerBeat)
  local byName = {}
  for _, a in ipairs(map) do byName[a.name] = a end

  local sorted = {}
  for _, n in ipairs(melodic) do
    if not n.muted then sorted[#sorted + 1] = n end
  end
  table.sort(sorted, function(a, b)
    if a.startppq ~= b.startppq then return a.startppq < b.startppq end
    return a.pitch < b.pitch
  end)

  local triggerTicks = TRIGGER_DURATION * ppqPerBeat
  local prerollTicks = KS_PREROLL * ppqPerBeat

  local runs, run = {}, nil
  for _, n in ipairs(sorted) do
    local art = n.art and byName[n.art] or nil
    if not art then
      run = nil
    elseif run and run.art.name == art.name then
      run.lastEnd = math.max(run.lastEnd, n.endppq)
    else
      run = { art = art, start = n.startppq, lastEnd = n.endppq }
      runs[#runs + 1] = run
    end
  end

  local seen, out = {}, {}
  for _, r in ipairs(runs) do
    local start = math.max(0, math.min(r.start, clipEndPPQ) - prerollTicks)
    local span  = math.max(triggerTicks, r.lastEnd - start)
    local dur   = r.art.hold and span or triggerTicks
    local key   = string.format("%d@%d", r.art.pitch, math.floor(start + 0.5))
    if not seen[key] then
      seen[key] = true
      out[#out + 1] = {
        pitch    = r.art.pitch,
        startppq = start,
        endppq   = start + math.max(dur, MIN_DURATION * ppqPerBeat),
        velocity = r.art.velocity or 100,
      }
    end
  end
  return out
end

--------------------------------------------------------------------------------
-- Reaper glue
--------------------------------------------------------------------------------
function M.getTake()
  local hwnd = reaper.MIDIEditor_GetActive()
  if hwnd then
    local take = reaper.MIDIEditor_GetTake(hwnd)
    if take and reaper.TakeIsMIDI(take) then return take end
  end
  local item = reaper.GetSelectedMediaItem(0, 0)
  if item then
    local take = reaper.GetActiveTake(item)
    if take and reaper.TakeIsMIDI(take) then return take end
  end
  return nil
end

local function readNotes(take)
  local notes = {}
  local _, noteCount = reaper.MIDI_CountEvts(take)
  for i = 0, noteCount - 1 do
    local ok, sel, muted, s, e, chan, pitch, vel = reaper.MIDI_GetNote(take, i)
    if ok then
      notes[#notes + 1] = {
        idx = i, sel = sel, muted = muted,
        startppq = s, endppq = e, chan = chan, pitch = pitch, vel = vel,
      }
    end
  end
  return notes
end

local function ppqPerBeat(take)
  local p = reaper.MIDI_GetPPQPosFromProjQN(take, 1) - reaper.MIDI_GetPPQPosFromProjQN(take, 0)
  if p <= 0 then p = 960 end
  return p
end

local function clipEndPPQ(take)
  local item = reaper.GetMediaItemTake_Item(take)
  local pos  = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
  local len  = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
  return reaper.MIDI_GetPPQPosFromProjTime(take, pos + len)
end

-- Core: derive articulations from existing keyswitches, override the selected
-- melodic notes with `newArt` (nil = clear; false = leave arts as derived), then
-- rewrite ALL keyswitch notes for this `map`. Melodic notes are never touched.
-- `channel` (0-based) is where keyswitch notes are written; nil => KS_CHANNEL.
-- The UI passes the active bank's articulations as `map` here.
function M.applyArticulation(take, map, newArt, onlySelected, channel)
  local ch = channel or KS_CHANNEL
  local ksPitch = {}
  for _, a in ipairs(map) do ksPitch[a.pitch] = a.name end

  local all = readNotes(take)
  local melodic, ksList = {}, {}
  for _, n in ipairs(all) do
    if ksPitch[n.pitch] ~= nil then
      ksList[#ksList + 1] = { start = n.startppq, name = ksPitch[n.pitch] }
    else
      melodic[#melodic + 1] = n
    end
  end

  articulationForMelodic(melodic, ksList)

  if newArt ~= false then
    for _, n in ipairs(melodic) do
      if (not onlySelected) or n.sel then n.art = newArt end
    end
  end

  local newKs = keyswitchesFromNotes(melodic, map, clipEndPPQ(take), ppqPerBeat(take))

  reaper.Undo_BeginBlock()
  for i = #all, 1, -1 do
    if ksPitch[all[i].pitch] ~= nil then reaper.MIDI_DeleteNote(take, all[i].idx) end
  end
  for _, k in ipairs(newKs) do
    reaper.MIDI_InsertNote(take, false, false, k.startppq, k.endppq,
      ch, k.pitch, k.velocity, true)
  end
  reaper.MIDI_Sort(take)
  reaper.Undo_EndBlock("ArticulationRoll: rebuild keyswitches", -1)

  return #newKs, #melodic
end

-- Report the articulation currently on the selected melodic notes for `map`
-- (derived from existing keyswitches). Returns the name if all selected notes
-- share one, "" if none, or nil if they differ / nothing is selected. Used by
-- the UI to highlight the active articulation button.
function M.selectedArticulation(take, map)
  local ksPitch = {}
  for _, a in ipairs(map) do ksPitch[a.pitch] = a.name end
  local all = readNotes(take)
  local melodic, ksList = {}, {}
  for _, n in ipairs(all) do
    if ksPitch[n.pitch] ~= nil then
      ksList[#ksList + 1] = { start = n.startppq, name = ksPitch[n.pitch] }
    else
      melodic[#melodic + 1] = n
    end
  end
  articulationForMelodic(melodic, ksList)
  local seen, count = nil, 0
  for _, n in ipairs(melodic) do
    if n.sel then
      count = count + 1
      local v = n.art or ""
      if seen == nil then seen = v elseif seen ~= v then return nil end
    end
  end
  if count == 0 then return nil end
  return seen
end

-- Back-compat wrapper for the key-bind / menu scripts, which use the plain-text
-- single-map file. The UI uses M.applyArticulation with a bank map instead.
function M.rebuild(take, newArt, onlySelected)
  return M.applyArticulation(take, M.loadMap(), newArt, onlySelected, nil)
end

--------------------------------------------------------------------------------
-- Menu (used by the "menu" front-end)
--------------------------------------------------------------------------------
local function showMenu(map)
  gfx.init("", 0, 0, 0, 0, 0)
  gfx.x, gfx.y = gfx.mouse_x, gfx.mouse_y
  local parts = {}
  for i, a in ipairs(map) do parts[#parts + 1] = string.format("%d  %s", i, a.name) end
  parts[#parts + 1] = ""
  parts[#parts + 1] = "Clear articulation"
  parts[#parts + 1] = "Rebuild keyswitches"
  parts[#parts + 1] = ""
  parts[#parts + 1] = "Edit map…"
  local sel = gfx.showmenu(table.concat(parts, "|"))
  gfx.quit()
  return sel
end

--------------------------------------------------------------------------------
-- Dispatcher — the single entry point every front-end script calls.
--   action: "menu" | "slot" | "clear" | "rebuild"
--   arg:    slot number (1-based index into the map) for action == "slot"
--------------------------------------------------------------------------------
function M.run(action, arg)
  local take = M.getTake()
  if not take then
    reaper.MB("Open a MIDI editor (or select a MIDI item) first.", "ArticulationRoll", 0)
    return
  end

  if action == "slot" then
    local map = M.loadMap()
    local a = map[arg]
    if not a then
      reaper.MB(string.format("No articulation in slot %d (map has %d).", arg, #map),
        "ArticulationRoll", 0)
      return
    end
    M.rebuild(take, a.name, true)

  elseif action == "clear" then
    M.rebuild(take, nil, true)

  elseif action == "rebuild" then
    M.rebuild(take, false, false)

  elseif action == "menu" then
    local map = M.loadMap()
    local n = #map
    local sel = showMenu(map)
    if sel == 0 then return end
    if sel >= 1 and sel <= n then
      M.rebuild(take, map[sel].name, true)
    elseif sel == n + 1 then
      M.rebuild(take, nil, true)          -- Clear articulation
    elseif sel == n + 2 then
      M.rebuild(take, false, false)       -- Rebuild keyswitches
    elseif sel == n + 3 then
      M.openMapFile()                     -- Edit map…
    end
  end
end

return M
