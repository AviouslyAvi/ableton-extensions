--[[
  ArticulationRoll — app (ReaImGui docked panel), channel-based.
  ---------------------------------------------------------------------------------
  Pick a bank, click an articulation to apply it to the selected notes. Each
  articulation owns a MIDI channel, so applying one retags the notes' channel —
  set the MIDI editor's note-color dropdown to "Channel" and the notes recolor to
  match the buttons here. Edit bank/articulation names, keyswitch pitches, and
  channels inline. Config auto-saves to ArticulationRoll_banks.lua.

  Requires the ReaImGui extension (ReaPack: "ReaImGui: ReaScript binding for Dear
  ImGui"). Shares its apply/keyswitch logic with ArticulationRoll_lib.lua.
]]--

------------------------------------------------------------------- load engine --
local sep  = package.config:sub(1, 1)
local here = ({reaper.get_action_context()})[2]:match("(.*" .. sep .. ")")
local ART  = dofile(here .. "ArticulationRoll_lib.lua")

------------------------------------------------------------------- load ReaImGui --
if not reaper.ImGui_GetBuiltinPath then
  reaper.MB(
    "ReaImGui isn't installed.\n\n" ..
    "Install it once via ReaPack:\n" ..
    "  Extensions > ReaPack > Browse packages\n" ..
    "  search \"ReaImGui\" > install \"ReaImGui: ReaScript binding for Dear ImGui\"\n" ..
    "then restart REAPER and run this again.",
    "ArticulationRoll", 0)
  return
end
package.path = reaper.ImGui_GetBuiltinPath() .. '/?.lua'
local ImGui = require 'imgui' '0.9'

------------------------------------------------------------------- channel colors --
-- Indicative palette (channel 0 = unassigned/grey). These won't match REAPER's
-- theme channel colors exactly, but give consistent per-articulation grouping.
local CHAN_RGB = {
  [0] = 0x9AA0A6, [1] = 0xE0564B, [2] = 0xE0904B, [3] = 0xE0C84B,
  [4] = 0x7DC24B, [5] = 0x4BC298, [6] = 0x4BB8E0, [7] = 0x4B7DE0,
  [8] = 0x6B4BE0, [9] = 0xA24BE0, [10] = 0xE04BC2, [11] = 0xE04B8A,
  [12] = 0xB07A4B, [13] = 0xAEE04B, [14] = 0x6B8AA2, [15] = 0xE07D8A,
}
local function rgba(ch, a) return ((CHAN_RGB[ch] or 0x9AA0A6) << 8) | (a or 0xFF) end
-- Slightly brighten a 0xRRGGBBAA color for hover.
local function lighten(col)
  local r = (col >> 24) & 0xFF; local g = (col >> 16) & 0xFF; local b = (col >> 8) & 0xFF
  local f = function(x) return math.min(255, math.floor(x * 1.18)) end
  return (f(r) << 24) | (f(g) << 16) | (f(b) << 8) | 0xFF
end

------------------------------------------------------------------- note names --
-- Match REAPER's note naming: octave = floor(pitch/12) + midioctoffs - 1, so with
-- the default midioctoffs=0, note 60 = "C4" and 0 = "C-1". Read the offset live
-- (via SWS) so names match the user's MIDI editor exactly.
local OCTOFFS = (reaper.SNM_GetIntConfigVar and reaper.SNM_GetIntConfigVar("midioctoffs", 0)) or 0
local NOTE_NAMES = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }
local NOTE_BASE  = { C = 0, D = 2, E = 4, F = 5, G = 7, A = 9, B = 11 }

local function noteName(p)
  return NOTE_NAMES[(p % 12) + 1] .. (math.floor(p / 12) + OCTOFFS - 1)
end

-- Parse a typed note ("C4", "c#3", "Db2") or a bare MIDI number. Returns a pitch
-- 0-127, or nil if it doesn't parse / is out of range.
local function parseNote(s)
  s = (s or ""):gsub("%s", "")
  if s == "" then return nil end
  if s:match("^%-?%d+$") then
    local v = tonumber(s)
    if v >= 0 and v <= 127 then return math.floor(v) end
    return nil
  end
  local L, acc, oct = s:match("^([A-Ga-g])([#bsBS]?)(%-?%d+)$")
  if not L then return nil end
  local base = NOTE_BASE[L:upper()]
  local a = acc:lower()
  if a == "#" or a == "s" then base = base + 1 elseif a == "b" then base = base - 1 end
  local p = (tonumber(oct) - OCTOFFS + 1) * 12 + base
  if p < 0 or p > 127 then return nil end
  return p
end

------------------------------------------------------------------- state --
local cfg      = ART.loadBanks()
local bankIdx  = 1
local editMode = false
local dirty    = false
local mapSel   = {}    -- edit-mode row selection: set keyed by articulation index
local mapAnchor = nil  -- last-clicked row, for shift-range selection
local ctx      = ImGui.CreateContext('ArticulationRoll')

local function curBank() return cfg.banks[bankIdx] end
local function saveCfg() ART.saveBanks(cfg); dirty = false end
local function activeTake() return ART.getTake() end

------------------------------------------------------------------- play mode --
local function drawPlayMode(take)
  local bank = curBank()
  local current = take and ART.selectedArticulation(take, bank.articulations) or nil

  if not take then
    ImGui.TextColored(ctx, 0xFF8080FF, "Open a MIDI editor (or select a MIDI item).")
    ImGui.Spacing(ctx)
  end

  local avail  = ImGui.GetContentRegionAvail(ctx)
  local btnW   = 130
  local perRow = math.max(1, math.floor(avail / (btnW + 8)))
  for i, a in ipairs(bank.articulations) do
    if (i - 1) % perRow ~= 0 then ImGui.SameLine(ctx) end
    local base   = rgba(a.channel, 0xE6)
    local active = (current ~= nil and current == a.name)
    ImGui.PushStyleColor(ctx, ImGui.Col_Button,        active and rgba(a.channel, 0xFF) or base)
    ImGui.PushStyleColor(ctx, ImGui.Col_ButtonHovered, lighten(base))
    ImGui.PushStyleColor(ctx, ImGui.Col_ButtonActive,  lighten(base))
    ImGui.PushStyleColor(ctx, ImGui.Col_Text,          0x111111FF)
    if active then
      ImGui.PushStyleColor(ctx, ImGui.Col_Border, 0xFFFFFFFF)
      ImGui.PushStyleVar(ctx, ImGui.StyleVar_FrameBorderSize, 2)
    end
    local label = string.format("%s\n%s  ch %d%s", a.name, noteName(a.pitch), a.channel + 1,
      a.hold and "  H" or "")
    if ImGui.Button(ctx, label .. "##art" .. i, btnW, 46) then
      if take then ART.applyArticulation(take, bank.articulations, a.name, true) end
    end
    if active then ImGui.PopStyleVar(ctx); ImGui.PopStyleColor(ctx) end
    ImGui.PopStyleColor(ctx, 4)
  end

  ImGui.Spacing(ctx); ImGui.Separator(ctx); ImGui.Spacing(ctx)

  if ImGui.Button(ctx, "Clear", 90, 0) then
    if take then ART.applyArticulation(take, bank.articulations, nil, true) end
  end
  ImGui.SameLine(ctx)
  if ImGui.Button(ctx, "Rebuild", 90, 0) then
    if take then ART.applyArticulation(take, bank.articulations, false, false) end
  end
  ImGui.SameLine(ctx)
  ImGui.TextDisabled(ctx, current == nil and "(select notes)"
    or (current == "" and "unassigned" or ("current: " .. current)))

  if ImGui.Button(ctx, "Dedupe", 90, 0) then
    if take then ART.dedupe(take, bank.articulations) end
  end
  if ImGui.IsItemHovered(ctx) then
    ImGui.SetTooltip(ctx, "Delete exact-duplicate notes (same pitch, start AND length) and any\n" ..
      "shorter note hidden behind a longer one at the same pitch. Undoable.")
  end
  ImGui.SameLine(ctx)
  if ImGui.Button(ctx, "Legato", 90, 0) then
    if take then ART.legato(take, bank.articulations) end
  end
  if ImGui.IsItemHovered(ctx) then
    ImGui.SetTooltip(ctx, "Stretch/shorten each note to end exactly where the next begins.\n" ..
      "Acts on the selected notes, or every note if none are selected. Undoable.")
  end

  ImGui.Spacing(ctx)
  ImGui.TextDisabled(ctx, "Tip: MIDI editor note-color dropdown -> \"Channel\" to see colors.")
end

------------------------------------------------------------------- ks keyboard --
-- A little piano keyboard (MIDI 0-36, C-1..C2 with default offset) showing where
-- each articulation's keyswitch note sits, colored by channel, with a numbered
-- pin per row. Hover shows the pitch; clicking a highlighted key selects that
-- row. Mirrors roll.html's "Keyswitch positions" visualiser.
local function isBlackKey(p) local m = p % 12; return m == 1 or m == 3 or m == 6 or m == 8 or m == 10 end

local function drawKsKeyboard(bank)
  local MINP, MAXP = 0, 36
  local WW, BW = 22, 13
  local WH, BH = 74, 46

  local wkX, wTotal = {}, 0
  for p = MINP, MAXP do
    if not isBlackKey(p) then wkX[p] = wTotal; wTotal = wTotal + WW end
  end

  local pitchArt = {}   -- pitch -> articulation index (last wins on collision)
  for i, a in ipairs(bank.articulations) do
    if a.pitch >= MINP and a.pitch <= MAXP then pitchArt[a.pitch] = i end
  end

  local dl = ImGui.GetWindowDrawList(ctx)
  local ox, oy = ImGui.GetCursorScreenPos(ctx)
  local clicked = ImGui.InvisibleButton(ctx, "##kskbd", wTotal, WH)
  local hovered = ImGui.IsItemHovered(ctx)
  local mx, my = ImGui.GetMousePos(ctx)

  local function blackX(p)
    local q = p - 1
    while q >= MINP and isBlackKey(q) do q = q - 1 end
    if q >= MINP then return ox + wkX[q] + WW - BW / 2 else return ox end
  end

  -- White keys
  for p = MINP, MAXP do
    if not isBlackKey(p) then
      local x = ox + wkX[p]
      local ai = pitchArt[p]
      local col = ai and rgba(bank.articulations[ai].channel, 0xFF) or 0xD2D2D2FF
      ImGui.DrawList_AddRectFilled(dl, x + 0.5, oy + 0.5, x + WW - 0.5, oy + WH - 0.5, col, 2)
      ImGui.DrawList_AddRect(dl, x + 0.5, oy + 0.5, x + WW - 0.5, oy + WH - 0.5, 0x000000AA, 2)
      if p % 12 == 0 and not ai then
        ImGui.DrawList_AddText(dl, x + 2, oy + WH - 16, 0x777777FF, noteName(p))
      end
    end
  end
  -- Black keys
  for p = MINP, MAXP do
    if isBlackKey(p) then
      local bx = blackX(p)
      local ai = pitchArt[p]
      local col = ai and rgba(bank.articulations[ai].channel, 0xFF) or 0x1A1A1AFF
      ImGui.DrawList_AddRectFilled(dl, bx, oy, bx + BW, oy + BH, col, 2)
      ImGui.DrawList_AddRect(dl, bx, oy, bx + BW, oy + BH, 0x000000CC, 2)
    end
  end
  -- Numbered pins on highlighted keys
  for i, a in ipairs(bank.articulations) do
    local p = a.pitch
    if p >= MINP and p <= MAXP then
      local blk = isBlackKey(p)
      local kx  = blk and (blackX(p) + BW / 2) or (ox + wkX[p] + WW / 2)
      local ky  = blk and (oy + 14) or (oy + WH - 14)
      local r   = blk and 8 or 9
      ImGui.DrawList_AddCircleFilled(dl, kx, ky, r, 0xF2F2F2F0)
      ImGui.DrawList_AddCircle(dl, kx, ky, r, rgba(a.channel, 0xFF), 0, 2)
      local lbl = tostring(i)
      local tw  = ImGui.CalcTextSize(ctx, lbl)
      ImGui.DrawList_AddText(dl, kx - tw / 2, ky - 7, 0x000000E6, lbl)
    end
  end

  -- Hover tooltip + click-to-select (black keys sit on top, so test them first)
  if hovered then
    local hit = nil
    for p = MAXP, MINP, -1 do
      if isBlackKey(p) then
        local bx = blackX(p)
        if mx >= bx and mx <= bx + BW and my <= oy + BH then hit = p; break end
      end
    end
    if hit == nil then
      for p = MAXP, MINP, -1 do
        if not isBlackKey(p) then
          local x = ox + wkX[p]
          if mx >= x and mx <= x + WW then hit = p; break end
        end
      end
    end
    if hit ~= nil then
      local ai = pitchArt[hit]
      ImGui.SetTooltip(ctx, string.format("%s  (MIDI %d)%s", noteName(hit), hit,
        ai and ("  -> " .. bank.articulations[ai].name) or ""))
      if clicked and ai then mapSel = { [ai] = true }; mapAnchor = ai end
    end
  end
end

------------------------------------------------------------------- edit mode --
local function drawEditMode()
  local bank = curBank()

  ImGui.Text(ctx, "Bank name")
  ImGui.SetNextItemWidth(ctx, 260)
  local chg, name = ImGui.InputText(ctx, "##bankname", bank.name)
  if chg then bank.name = name; dirty = true end
  ImGui.Spacing(ctx)

  -- Selection toolbar (click a row's color swatch to select; shift-click ranges).
  local nsel = 0; for _ in pairs(mapSel) do nsel = nsel + 1 end
  if ImGui.Button(ctx, "Select all") then
    mapSel = {}; for i = 1, #bank.articulations do mapSel[i] = true end
    mapAnchor = nil
  end
  ImGui.SameLine(ctx)
  local doDeleteSel = false
  if nsel > 0 then
    if ImGui.Button(ctx, "Delete selected") then doDeleteSel = true end
    ImGui.SameLine(ctx)
    ImGui.TextDisabled(ctx, nsel .. " selected")
  else
    ImGui.TextDisabled(ctx, "Click a row's color chip to select (shift-click for a range).")
  end
  ImGui.Spacing(ctx)

  local flags = ImGui.TableFlags_Borders | ImGui.TableFlags_RowBg | ImGui.TableFlags_SizingStretchProp
  if ImGui.BeginTable(ctx, "arts", 6, flags) then
    ImGui.TableSetupColumn(ctx, "",      ImGui.TableColumnFlags_WidthFixed, 22)
    ImGui.TableSetupColumn(ctx, "Name")
    ImGui.TableSetupColumn(ctx, "KS note", ImGui.TableColumnFlags_WidthFixed, 80)
    ImGui.TableSetupColumn(ctx, "Vel",   ImGui.TableColumnFlags_WidthFixed, 60)
    ImGui.TableSetupColumn(ctx, "Chan",  ImGui.TableColumnFlags_WidthFixed, 70)
    ImGui.TableSetupColumn(ctx, "Hold  x", ImGui.TableColumnFlags_WidthFixed, 70)
    ImGui.TableHeadersRow(ctx)

    local removeIdx = nil
    for i, a in ipairs(bank.articulations) do
      ImGui.TableNextRow(ctx)
      if mapSel[i] then
        ImGui.TableSetBgColor(ctx, ImGui.TableBgTarget_RowBg0, 0x3A6EA566)
      end

      ImGui.TableSetColumnIndex(ctx, 0)
      if ImGui.ColorButton(ctx, "##c" .. i, rgba(a.channel, 0xFF),
        ImGui.ColorEditFlags_NoTooltip | ImGui.ColorEditFlags_NoDragDrop, 16, 16) then
        local shift = (ImGui.GetKeyMods(ctx) & ImGui.Mod_Shift) ~= 0
        if shift and mapAnchor then
          local lo, hi = math.min(mapAnchor, i), math.max(mapAnchor, i)
          for k = lo, hi do mapSel[k] = true end
        else
          if mapSel[i] then mapSel[i] = nil else mapSel[i] = true end
          mapAnchor = i
        end
      end

      ImGui.TableSetColumnIndex(ctx, 1)
      ImGui.SetNextItemWidth(ctx, -1)
      local c1, nm = ImGui.InputText(ctx, "##n" .. i, a.name)
      if c1 then a.name = nm; dirty = true end

      ImGui.TableSetColumnIndex(ctx, 2)
      ImGui.SetNextItemWidth(ctx, -1)
      -- Note name field: accepts "C4", "F#3", "Db2", or a bare MIDI number.
      local c2, txt = ImGui.InputText(ctx, "##p" .. i, noteName(a.pitch))
      if c2 then local np = parseNote(txt); if np then a.pitch = np; dirty = true end end
      if ImGui.IsItemHovered(ctx) then
        ImGui.SetTooltip(ctx, string.format("Keyswitch note (MIDI %d). Type e.g. C4, F#3, Db2.", a.pitch))
      end

      ImGui.TableSetColumnIndex(ctx, 3)
      ImGui.SetNextItemWidth(ctx, -1)
      local c3, v = ImGui.InputInt(ctx, "##v" .. i, a.velocity or 100)
      if c3 then a.velocity = math.max(1, math.min(127, v)); dirty = true end

      ImGui.TableSetColumnIndex(ctx, 4)
      ImGui.SetNextItemWidth(ctx, -1)
      local c4, ch = ImGui.InputInt(ctx, "##ch" .. i, a.channel + 1)
      if c4 then a.channel = math.max(0, math.min(15, ch - 1)); dirty = true end

      ImGui.TableSetColumnIndex(ctx, 5)
      local c5, h = ImGui.Checkbox(ctx, "##h" .. i, a.hold == true)
      if c5 then a.hold = h; dirty = true end
      ImGui.SameLine(ctx)
      if ImGui.Button(ctx, "x##rm" .. i) then removeIdx = i end
    end
    ImGui.EndTable(ctx)
    if removeIdx then table.remove(bank.articulations, removeIdx); mapSel = {}; mapAnchor = nil; dirty = true end
  end

  -- Delete selected rows (high index first so positions stay valid).
  if doDeleteSel then
    local idxs = {}; for k in pairs(mapSel) do idxs[#idxs + 1] = k end
    table.sort(idxs, function(x, y) return x > y end)
    for _, k in ipairs(idxs) do table.remove(bank.articulations, k) end
    mapSel = {}; mapAnchor = nil; dirty = true
  end

  ImGui.Spacing(ctx)
  if ImGui.Button(ctx, "+ Add articulation") then
    local maxp, usedCh = -1, {}
    for _, a in ipairs(bank.articulations) do
      if a.pitch > maxp then maxp = a.pitch end
      usedCh[a.channel] = true
    end
    local ch = 1; while ch < 16 and usedCh[ch] do ch = ch + 1 end
    bank.articulations[#bank.articulations + 1] =
      { name = "New", pitch = math.min(127, maxp + 1), velocity = 100, hold = false, channel = ch }
    dirty = true
  end
  ImGui.SameLine(ctx)
  if ImGui.Button(ctx, "Auto-pitch") then
    if #bank.articulations > 0 then
      local base = bank.articulations[1].pitch or 0
      for i, a in ipairs(bank.articulations) do a.pitch = math.min(127, base + (i - 1)) end
      dirty = true
    end
  end
  if ImGui.IsItemHovered(ctx) then
    ImGui.SetTooltip(ctx, "Cascade keyswitch notes upward from the first: each row's pitch\n" ..
      "becomes (first row's pitch + its position). Sequential from the top.")
  end
  ImGui.SameLine(ctx)
  ImGui.TextDisabled(ctx, "Chan colors the notes (channel 1 = unassigned).")

  -- Keyswitch keyboard visualiser.
  ImGui.Spacing(ctx); ImGui.Separator(ctx)
  ImGui.TextDisabled(ctx, "Keyswitch positions  (hover for pitch · click a highlighted key to select its row)")
  ImGui.Spacing(ctx)
  drawKsKeyboard(bank)
end

------------------------------------------------------------------- top bar --
local function drawTopBar()
  ImGui.SetNextItemWidth(ctx, 200)
  if ImGui.BeginCombo(ctx, "##bank", curBank().name) then
    for i, b in ipairs(cfg.banks) do
      if ImGui.Selectable(ctx, b.name .. "##b" .. i, i == bankIdx) then bankIdx = i end
    end
    ImGui.EndCombo(ctx)
  end

  ImGui.SameLine(ctx)
  if ImGui.Button(ctx, "+ Bank") then
    cfg.banks[#cfg.banks + 1] = { name = "Bank " .. (#cfg.banks + 1),
      articulations = { { name = "Sustain", pitch = 0, velocity = 100, hold = false, channel = 1 } } }
    bankIdx = #cfg.banks; editMode = true; dirty = true
  end
  ImGui.SameLine(ctx)
  if #cfg.banks > 1 and ImGui.Button(ctx, "- Bank") then
    table.remove(cfg.banks, bankIdx)
    bankIdx = math.max(1, math.min(bankIdx, #cfg.banks)); dirty = true
  end

  ImGui.SameLine(ctx)
  local c, v = ImGui.Checkbox(ctx, "Edit", editMode)
  if c then
    editMode = v
    if not editMode and dirty then saveCfg() end
  end

  if dirty then
    ImGui.SameLine(ctx)
    if ImGui.Button(ctx, "Save") then saveCfg() end
    ImGui.SameLine(ctx); ImGui.TextColored(ctx, 0xE0C040FF, "*")
  end
end

------------------------------------------------------------------- main loop --
local function loop()
  ImGui.SetNextWindowSize(ctx, 580, 400, ImGui.Cond_FirstUseEver)
  local visible, open = ImGui.Begin(ctx, 'Articulation Roll', true)
  if visible then
    drawTopBar()
    ImGui.Separator(ctx); ImGui.Spacing(ctx)
    if editMode then drawEditMode() else drawPlayMode(activeTake()) end
    ImGui.End(ctx)
  end
  if open then reaper.defer(loop) else if dirty then saveCfg() end end
end

reaper.defer(loop)
