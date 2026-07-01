-- ArticulationRoll — assign articulation SLOT 4 (Nth line of the map) to selected notes.
-- Bind to a key. Slot is map-position-based, so renaming/re-pitching the map keeps this stable.
local sep  = package.config:sub(1, 1)
local here = ({reaper.get_action_context()})[2]:match("(.*" .. sep .. ")")
local ART  = dofile(here .. "ArticulationRoll_lib.lua")
ART.run("slot", 4)
