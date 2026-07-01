--[[
  ArticulationRoll — shared engine library (channel-based).
  ---------------------------------------------------------------------------------
  Each articulation owns a MIDI CHANNEL. A melodic note's articulation IS its
  channel — so assigning an articulation just retags the selected notes' channel,
  and (with the MIDI editor set to "color notes by channel") the notes visibly
  recolor. Keyswitch notes are then regenerated from those channels and written on
  the matching channel. Channel 0 (displayed "1") is reserved for "unassigned":
  notes there get no keyswitch.

  This replaces the earlier keyswitch-derived design (which couldn't color notes
  and got ambiguous for stacked notes). The keyswitch run/hold/pre-roll logic is
  still the one ported from ../src/extension.ts (keyswitchesFromNotes).

  Front-ends load this and call M.run("menu"/"slot"/"clear"/"rebuild") or, for the
  app, M.applyArticulation / M.selectedArticulation with a bank's articulations.
]]--

local M = {}

--------------------------------------------------------------------------------
-- Constants (beats == quarter notes, as in Live)
--------------------------------------------------------------------------------
local TRIGGER_DURATION = 0.25   -- beats, length of a non-held keyswitch trigger
local KS_PREROLL       = 0.0625 -- beats, nudge keyswitch a hair before its note
local MIN_DURATION     = 1e-4   -- guard against zero/negative lengths
local UNASSIGNED_CH    = 0      -- 0-based channel meaning "no articulation"

-- Default articulations: pitches 0-7, each on its own channel (index 1-8, i.e.
-- displayed channels 2-9). Channel 0/"1" stays free as the unassigned lane.
local DEFAULT_ARTS = {
  { name = "Sustain",   pitch = 0, velocity = 100, hold = false, channel = 1 },
  { name = "Legato",    pitch = 1, velocity = 100, hold = false, channel = 2 },
  { name = "Staccato",  pitch = 2, velocity = 100, hold = false, channel = 3 },
  { name = "Spiccato",  pitch = 3, velocity = 100, hold = false, channel = 4 },
  { name = "Pizzicato", pitch = 4, velocity = 100, hold = false, channel = 5 },
  { name = "Tremolo",   pitch = 5, velocity = 100, hold = false, channel = 6 },
  { name = "Trill",     pitch = 6, velocity = 100, hold = false, channel = 7 },
  { name = "Marcato",   pitch = 7, velocity = 100, hold = false, channel = 8 },
}

M.UNASSIGNED_CH = UNASSIGNED_CH

--------------------------------------------------------------------------------
-- Bank config (multi-bank). Stored as a Lua table so we can load it with load()
-- and serialize it by hand — no JSON dependency.
--   { version = 2, banks = { { name, articulations = { {name,pitch,velocity,hold,channel}, ... } }, ... } }
--------------------------------------------------------------------------------
local BANKS_FILENAME = "ArticulationRoll_banks.lua"

local function banksPath() return reaper.GetResourcePath() .. "/" .. BANKS_FILENAME end
M.banksPath = banksPath

local function copyArts(src)
  local out = {}
  for _, a in ipairs(src) do
    out[#out + 1] = { name = a.name, pitch = a.pitch, velocity = a.velocity,
      hold = a.hold, channel = a.channel }
  end
  return out
end

function M.defaultBanks()
  return { version = 2, banks = { { name = "Default", articulations = copyArts(DEFAULT_ARTS) } } }
end

-- Fill in / clamp fields so older configs (no channel) still work.
local function migrate(data)
  for _, b in ipairs(data.banks) do
    b.articulations = b.articulations or {}
    for i, a in ipairs(b.articulations) do
      a.pitch    = math.max(0, math.min(127, tonumber(a.pitch) or 0))
      a.velocity = math.max(1, math.min(127, tonumber(a.velocity) or 100))
      a.hold     = a.hold == true
      -- No channel in an old file => assign one by position (index i, so the
      -- unassigned channel 0 stays free).
      a.channel  = math.max(0, math.min(15, tonumber(a.channel) or i))
      a.name     = tostring(a.name or ("Art " .. i))
    end
  end
  return data
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
  return migrate(data)
end

local function q(s) return '"' .. tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"') .. '"' end

function M.saveBanks(data)
  local f = io.open(banksPath(), "w")
  if not f then return false end
  f:write("-- ArticulationRoll banks — edited by the ArticulationRoll app.\n")
  f:write("return {\n  version = 2,\n  banks = {\n")
  for _, b in ipairs(data.banks) do
    f:write(string.format("    { name = %s, articulations = {\n", q(b.name)))
    for _, a in ipairs(b.articulations) do
      f:write(string.format(
        "      { name = %s, pitch = %d, velocity = %d, hold = %s, channel = %d },\n",
        q(a.name), tonumber(a.pitch) or 0, tonumber(a.velocity) or 100,
        tostring(a.hold == true), tonumber(a.channel) or 0))
    end
    f:write("    }},\n")
  end
  f:write("  },\n}\n")
  f:close()
  return true
end

--------------------------------------------------------------------------------
-- Keyswitch synthesis (ported from extension.ts keyswitchesFromNotes).
--   Group melodic notes into runs of consecutive equal articulation (by channel);
--   emit one keyswitch per run on the articulation's channel. Held art spans to
--   the run's furthest end; others get a short trigger. Muted notes excluded (not
--   run-breaking); unassigned channel breaks a run and emits nothing. Deduped by
--   pitch+start.
--------------------------------------------------------------------------------
local function keyswitchesFromNotes(melodic, articulations, clipEndPPQ, ppqPerBeat)
  local byChan = {}
  for _, a in ipairs(articulations) do byChan[a.channel] = a end

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
    local art = byChan[n.chan]
    if not art then
      run = nil
    elseif run and run.art == art then
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
        channel  = r.art.channel or 0,
      }
    end
  end
  return out
end
M.keyswitchesFromNotes = keyswitchesFromNotes

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

-- Split notes into melodic vs keyswitch (by pitch). Returns melodic[], ksPitchSet.
local function splitNotes(all, articulations)
  local ksPitch = {}
  for _, a in ipairs(articulations) do ksPitch[a.pitch] = true end
  local melodic = {}
  for _, n in ipairs(all) do
    if not ksPitch[n.pitch] then melodic[#melodic + 1] = n end
  end
  return melodic, ksPitch
end

-- Core operation. `action`:
--   a string  -> assign that articulation (retag notes to its channel)
--   nil       -> clear (retag notes to the unassigned channel)
--   false     -> rebuild only (don't retag; just regenerate keyswitches)
-- `onlySelected` limits retagging to selected melodic notes.
-- Returns (#keyswitchNotesWritten, #notesRetagged).
function M.applyArticulation(take, articulations, action, onlySelected)
  local all = readNotes(take)
  local melodic, ksPitch = splitNotes(all, articulations)

  -- Resolve the target channel for a retag.
  local targetCh = nil
  if action ~= false then
    if action == nil then
      targetCh = UNASSIGNED_CH
    else
      for _, a in ipairs(articulations) do
        if a.name == action then targetCh = a.channel; break end
      end
      if targetCh == nil then return 0, 0 end  -- unknown articulation name
    end
  end

  reaper.Undo_BeginBlock()

  -- Retag selected melodic notes' channel (in Reaper + in our in-memory copy).
  local retagged = 0
  if targetCh ~= nil then
    for _, n in ipairs(melodic) do
      if (not onlySelected) or n.sel then
        if n.chan ~= targetCh then
          reaper.MIDI_SetNote(take, n.idx, nil, nil, nil, nil, targetCh, nil, nil, true)
        end
        n.chan = targetCh
        retagged = retagged + 1
      end
    end
  end

  -- Regenerate keyswitches from the (updated) melodic channels.
  local newKs = keyswitchesFromNotes(melodic, articulations, clipEndPPQ(take), ppqPerBeat(take))

  -- Delete existing keyswitch-pitch notes (high index -> low so indices stay valid).
  for i = #all, 1, -1 do
    if ksPitch[all[i].pitch] then reaper.MIDI_DeleteNote(take, all[i].idx) end
  end
  for _, k in ipairs(newKs) do
    reaper.MIDI_InsertNote(take, false, false, k.startppq, k.endppq,
      k.channel, k.pitch, k.velocity, true)
  end
  reaper.MIDI_Sort(take)
  reaper.Undo_EndBlock("ArticulationRoll: apply articulation", -1)

  return #newKs, retagged
end

-- Dedupe: delete exact-duplicate melodic notes (same pitch, start AND end) and
-- any shorter note that truly overlaps a strictly longer note at the same pitch
-- (covered or partially behind it — notes that only touch edges are left alone).
-- Then regenerate keyswitches. One undo step. Ported from roll.html "Dedupe".
-- Returns #notesRemoved.
function M.dedupe(take, articulations)
  local all = readNotes(take)
  local melodic, ksPitch = splitNotes(all, articulations)

  local toRemove = {}   -- set keyed by note idx
  local seen = {}
  for _, n in ipairs(melodic) do
    local key = string.format("%d@%d:%d", n.pitch, n.startppq, n.endppq)
    if seen[key] then toRemove[n.idx] = true else seen[key] = true end
  end
  for _, b in ipairs(melodic) do
    if not toRemove[b.idx] then
      local bDur = b.endppq - b.startppq
      for _, a in ipairs(melodic) do
        if a ~= b and a.pitch == b.pitch and (a.endppq - a.startppq) > bDur
           and not toRemove[a.idx] then
          if a.startppq < b.endppq and b.startppq < a.endppq then  -- true overlap
            toRemove[b.idx] = true
            break
          end
        end
      end
    end
  end

  local removed = 0
  local kept = {}
  for _, n in ipairs(melodic) do
    if toRemove[n.idx] then removed = removed + 1 else kept[#kept + 1] = n end
  end
  if removed == 0 then return 0 end

  local newKs = keyswitchesFromNotes(kept, articulations, clipEndPPQ(take), ppqPerBeat(take))

  reaper.Undo_BeginBlock()
  for i = #all, 1, -1 do
    local n = all[i]
    if ksPitch[n.pitch] or toRemove[n.idx] then reaper.MIDI_DeleteNote(take, n.idx) end
  end
  for _, k in ipairs(newKs) do
    reaper.MIDI_InsertNote(take, false, false, k.startppq, k.endppq,
      k.channel, k.pitch, k.velocity, true)
  end
  reaper.MIDI_Sort(take)
  reaper.Undo_EndBlock("ArticulationRoll: dedupe", -1)
  return removed
end

-- Legato: stretch/shorten each note so it ends exactly where the next note
-- begins (nearest later start on ANY pitch). Acts on the SELECTED melodic notes
-- if any are selected, otherwise on every melodic note; in the selected case the
-- start-boundaries also come from the selection. Then regenerate keyswitches.
-- One undo step. Ported from roll.html "Legato". Returns #notesChanged.
function M.legato(take, articulations)
  local all = readNotes(take)
  local melodic, ksPitch = splitNotes(all, articulations)

  local anySel = false
  for _, n in ipairs(melodic) do if n.sel then anySel = true; break end end
  local targets = {}
  for _, n in ipairs(melodic) do
    if (not anySel) or n.sel then targets[#targets + 1] = n end
  end
  if #targets == 0 then return 0 end

  local startSet = {}
  for _, n in ipairs(targets) do startSet[n.startppq] = true end
  local starts = {}
  for s in pairs(startSet) do starts[#starts + 1] = s end
  table.sort(starts)
  local EPS = 0.5   -- half a tick
  local function nextStartAfter(t)
    for _, s in ipairs(starts) do if s > t + EPS then return s end end
    return nil
  end

  local changed = 0
  reaper.Undo_BeginBlock()
  for _, n in ipairs(targets) do
    local nx = nextStartAfter(n.startppq)
    if nx and math.abs(n.endppq - nx) > EPS then
      reaper.MIDI_SetNote(take, n.idx, nil, nil, nil, nx, nil, nil, nil, true)
      n.endppq = nx
      changed = changed + 1
    end
  end
  if changed == 0 then
    reaper.Undo_EndBlock("ArticulationRoll: legato", -1)
    return 0
  end

  local newKs = keyswitchesFromNotes(melodic, articulations, clipEndPPQ(take), ppqPerBeat(take))
  for i = #all, 1, -1 do
    if ksPitch[all[i].pitch] then reaper.MIDI_DeleteNote(take, all[i].idx) end
  end
  for _, k in ipairs(newKs) do
    reaper.MIDI_InsertNote(take, false, false, k.startppq, k.endppq,
      k.channel, k.pitch, k.velocity, true)
  end
  reaper.MIDI_Sort(take)
  reaper.Undo_EndBlock("ArticulationRoll: legato", -1)
  return changed
end

-- The articulation currently on the selected melodic notes, by channel. Returns
-- the name if all selected notes share one articulation, "" if they're all
-- unassigned, or nil if they differ / nothing is selected. Drives button
-- highlighting in the app.
function M.selectedArticulation(take, articulations)
  local byChan = {}
  for _, a in ipairs(articulations) do byChan[a.channel] = a.name end
  local all = readNotes(take)
  local melodic = splitNotes(all, articulations)
  local seen, count = nil, 0
  for _, n in ipairs(melodic) do
    if n.sel then
      count = count + 1
      local v = byChan[n.chan] or ""
      if seen == nil then seen = v elseif seen ~= v then return nil end
    end
  end
  if count == 0 then return nil end
  return seen
end

-- Back-compat wrapper (used by tests). Uses the first bank.
function M.rebuild(take, action, onlySelected)
  return M.applyArticulation(take, M.loadBanks().banks[1].articulations, action, onlySelected)
end

--------------------------------------------------------------------------------
-- Open the banks config file in the OS default editor.
--------------------------------------------------------------------------------
function M.openBanksFile()
  local path = banksPath()
  if not reaper.file_exists(path) then M.saveBanks(M.defaultBanks()) end
  if reaper.CF_ShellExecute then
    reaper.CF_ShellExecute(path)
  elseif reaper.GetOS():match("Win") then
    os.execute('cmd /c start "" "' .. path .. '"')
  else
    os.execute('open "' .. path .. '"')
  end
  reaper.ShowConsoleMsg("ArticulationRoll banks: " .. path .. "\n")
end

--------------------------------------------------------------------------------
-- Menu (used by the "menu" front-end)
--------------------------------------------------------------------------------
local function showMenu(arts)
  gfx.init("", 0, 0, 0, 0, 0)
  gfx.x, gfx.y = gfx.mouse_x, gfx.mouse_y
  local parts = {}
  for i, a in ipairs(arts) do parts[#parts + 1] = string.format("%d  %s", i, a.name) end
  parts[#parts + 1] = ""
  parts[#parts + 1] = "Clear articulation"
  parts[#parts + 1] = "Rebuild keyswitches"
  parts[#parts + 1] = ""
  parts[#parts + 1] = "Edit banks…"
  local sel = gfx.showmenu(table.concat(parts, "|"))
  gfx.quit()
  return sel
end

--------------------------------------------------------------------------------
-- Dispatcher for the key-bind + menu scripts. Operates on the FIRST bank.
--   action: "menu" | "slot" | "clear" | "rebuild"
--   arg:    slot number (1-based index into bank 1's articulations) for "slot"
--------------------------------------------------------------------------------
function M.run(action, arg)
  local take = M.getTake()
  if not take then
    reaper.MB("Open a MIDI editor (or select a MIDI item) first.", "ArticulationRoll", 0)
    return
  end
  local arts = M.loadBanks().banks[1].articulations

  if action == "slot" then
    local a = arts[arg]
    if not a then
      reaper.MB(string.format("No articulation in slot %d (bank has %d).", arg, #arts),
        "ArticulationRoll", 0)
      return
    end
    M.applyArticulation(take, arts, a.name, true)

  elseif action == "clear" then
    M.applyArticulation(take, arts, nil, true)

  elseif action == "rebuild" then
    M.applyArticulation(take, arts, false, false)

  elseif action == "menu" then
    local n = #arts
    local sel = showMenu(arts)
    if sel == 0 then return end
    if sel >= 1 and sel <= n then
      M.applyArticulation(take, arts, arts[sel].name, true)
    elseif sel == n + 1 then
      M.applyArticulation(take, arts, nil, true)       -- Clear
    elseif sel == n + 2 then
      M.applyArticulation(take, arts, false, false)    -- Rebuild
    elseif sel == n + 3 then
      M.openBanksFile()                                -- Edit banks…
    end
  end
end

return M
