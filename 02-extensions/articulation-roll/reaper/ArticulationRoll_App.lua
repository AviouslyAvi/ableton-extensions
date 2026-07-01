--[[
  ArticulationRoll — app (ReaImGui docked panel).
  ---------------------------------------------------------------------------------
  The "Ableton-like" front-end: one script, one window. Pick a bank, click an
  articulation to apply it to the selected notes, and edit bank/articulation names
  + keyswitch pitches inline. No key-binding or multi-script setup required.

  Requires the ReaImGui extension (install once via ReaPack:
  Extensions -> ReaPack -> Browse packages -> "ReaImGui: ReaScript binding for
  Dear ImGui"). The apply/keyswitch logic is shared with the key-bind scripts via
  ArticulationRoll_lib.lua.
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

------------------------------------------------------------------- state --
local cfg      = ART.loadBanks()
local bankIdx  = 1                     -- 1-based index into cfg.banks
local editMode = false
local dirty    = false                 -- unsaved edits pending
local ctx      = ImGui.CreateContext('ArticulationRoll')

local function curBank() return cfg.banks[bankIdx] end

local function saveCfg()
  ART.saveBanks(cfg)
  dirty = false
end

-- The active MIDI take, or nil. Mirrors the lib's getTake().
local function activeTake() return ART.getTake() end

------------------------------------------------------------------- UI: play mode --
local function drawPlayMode(take)
  local bank = curBank()

  -- Which articulation do the selected notes currently carry? (for highlight)
  local current = take and ART.selectedArticulation(take, bank.articulations) or nil

  if not take then
    ImGui.TextColored(ctx, 0xFF8080FF, "Open a MIDI editor (or select a MIDI item).")
    ImGui.Spacing(ctx)
  end

  -- Articulation buttons, wrapped into a responsive grid.
  local avail = ImGui.GetContentRegionAvail(ctx)
  local btnW  = 132
  local perRow = math.max(1, math.floor(avail / (btnW + 8)))
  for i, a in ipairs(bank.articulations) do
    if (i - 1) % perRow ~= 0 then ImGui.SameLine(ctx) end
    local active = (current ~= nil and current == a.name)
    if active then
      ImGui.PushStyleColor(ctx, ImGui.Col_Button,        0x3B7DD8FF)
      ImGui.PushStyleColor(ctx, ImGui.Col_ButtonHovered, 0x4C8EE9FF)
    end
    local label = string.format("%s\n%d%s", a.name, a.pitch, a.hold and "  (hold)" or "")
    if ImGui.Button(ctx, label .. "##art" .. i, btnW, 44) then
      if take then ART.applyArticulation(take, bank.articulations, a.name, true, bank.channel) end
    end
    if active then ImGui.PopStyleColor(ctx, 2) end
  end

  ImGui.Spacing(ctx); ImGui.Separator(ctx); ImGui.Spacing(ctx)

  if ImGui.Button(ctx, "Clear", 90, 0) then
    if take then ART.applyArticulation(take, bank.articulations, nil, true, bank.channel) end
  end
  ImGui.SameLine(ctx)
  if ImGui.Button(ctx, "Rebuild", 90, 0) then
    if take then ART.applyArticulation(take, bank.articulations, false, false, bank.channel) end
  end
  ImGui.SameLine(ctx)
  ImGui.TextDisabled(ctx, current == nil and "" or (current == "" and "(no articulation)" or ("current: " .. current)))
end

------------------------------------------------------------------- UI: edit mode --
local function drawEditMode()
  local bank = curBank()

  -- Bank name + channel.
  ImGui.Text(ctx, "Bank name")
  ImGui.SetNextItemWidth(ctx, 240)
  local chg, name = ImGui.InputText(ctx, "##bankname", bank.name)
  if chg then bank.name = name; dirty = true end
  ImGui.SameLine(ctx)
  ImGui.Text(ctx, "  KS channel (1-16)")
  ImGui.SameLine(ctx)
  ImGui.SetNextItemWidth(ctx, 80)
  local cch, ch = ImGui.InputInt(ctx, "##bankch", (bank.channel or 0) + 1)
  if cch then bank.channel = math.max(0, math.min(15, ch - 1)); dirty = true end

  ImGui.Spacing(ctx)

  -- Articulation table.
  local flags = ImGui.TableFlags_Borders | ImGui.TableFlags_RowBg | ImGui.TableFlags_SizingStretchProp
  if ImGui.BeginTable(ctx, "arts", 5, flags) then
    ImGui.TableSetupColumn(ctx, "Name")
    ImGui.TableSetupColumn(ctx, "Pitch", ImGui.TableColumnFlags_WidthFixed, 70)
    ImGui.TableSetupColumn(ctx, "Vel",   ImGui.TableColumnFlags_WidthFixed, 60)
    ImGui.TableSetupColumn(ctx, "Hold",  ImGui.TableColumnFlags_WidthFixed, 50)
    ImGui.TableSetupColumn(ctx, "",      ImGui.TableColumnFlags_WidthFixed, 30)
    ImGui.TableHeadersRow(ctx)

    local removeIdx = nil
    for i, a in ipairs(bank.articulations) do
      ImGui.TableNextRow(ctx)
      ImGui.TableSetColumnIndex(ctx, 0)
      ImGui.SetNextItemWidth(ctx, -1)
      local c1, nm = ImGui.InputText(ctx, "##n" .. i, a.name)
      if c1 then a.name = nm; dirty = true end

      ImGui.TableSetColumnIndex(ctx, 1)
      ImGui.SetNextItemWidth(ctx, -1)
      local c2, p = ImGui.InputInt(ctx, "##p" .. i, a.pitch)
      if c2 then a.pitch = math.max(0, math.min(127, p)); dirty = true end

      ImGui.TableSetColumnIndex(ctx, 2)
      ImGui.SetNextItemWidth(ctx, -1)
      local c3, v = ImGui.InputInt(ctx, "##v" .. i, a.velocity or 100)
      if c3 then a.velocity = math.max(1, math.min(127, v)); dirty = true end

      ImGui.TableSetColumnIndex(ctx, 3)
      local c4, h = ImGui.Checkbox(ctx, "##h" .. i, a.hold == true)
      if c4 then a.hold = h; dirty = true end

      ImGui.TableSetColumnIndex(ctx, 4)
      if ImGui.Button(ctx, "x##rm" .. i) then removeIdx = i end
    end
    ImGui.EndTable(ctx)

    if removeIdx then table.remove(bank.articulations, removeIdx); dirty = true end
  end

  ImGui.Spacing(ctx)
  if ImGui.Button(ctx, "+ Add articulation") then
    -- Next free pitch = max existing + 1 (clamped).
    local maxp = -1
    for _, a in ipairs(bank.articulations) do if a.pitch > maxp then maxp = a.pitch end end
    bank.articulations[#bank.articulations + 1] =
      { name = "New", pitch = math.min(127, maxp + 1), velocity = 100, hold = false }
    dirty = true
  end
end

------------------------------------------------------------------- top bar --
local function drawTopBar()
  -- Bank selector.
  ImGui.SetNextItemWidth(ctx, 200)
  if ImGui.BeginCombo(ctx, "##bank", curBank().name) then
    for i, b in ipairs(cfg.banks) do
      if ImGui.Selectable(ctx, b.name .. "##b" .. i, i == bankIdx) then bankIdx = i end
    end
    ImGui.EndCombo(ctx)
  end

  ImGui.SameLine(ctx)
  if ImGui.Button(ctx, "+ Bank") then
    cfg.banks[#cfg.banks + 1] = { name = "Bank " .. (#cfg.banks + 1), channel = 0,
      articulations = { { name = "Sustain", pitch = 0, velocity = 100, hold = false } } }
    bankIdx = #cfg.banks
    editMode = true
    dirty = true
  end
  ImGui.SameLine(ctx)
  if #cfg.banks > 1 and ImGui.Button(ctx, "- Bank") then
    table.remove(cfg.banks, bankIdx)
    bankIdx = math.max(1, math.min(bankIdx, #cfg.banks))
    dirty = true
  end

  ImGui.SameLine(ctx)
  local c, v = ImGui.Checkbox(ctx, "Edit", editMode)
  if c then
    editMode = v
    if not editMode and dirty then saveCfg() end   -- auto-save when leaving edit
  end

  if dirty then
    ImGui.SameLine(ctx)
    if ImGui.Button(ctx, "Save") then saveCfg() end
    ImGui.SameLine(ctx)
    ImGui.TextColored(ctx, 0xE0C040FF, "*")
  end
end

------------------------------------------------------------------- main loop --
local function loop()
  ImGui.SetNextWindowSize(ctx, 560, 380, ImGui.Cond_FirstUseEver)
  local visible, open = ImGui.Begin(ctx, 'Articulation Roll', true)
  if visible then
    drawTopBar()
    ImGui.Separator(ctx)
    ImGui.Spacing(ctx)
    if editMode then drawEditMode() else drawPlayMode(activeTake()) end
    ImGui.End(ctx)
  end
  if open then
    reaper.defer(loop)
  else
    if dirty then saveCfg() end
  end
end

reaper.defer(loop)
