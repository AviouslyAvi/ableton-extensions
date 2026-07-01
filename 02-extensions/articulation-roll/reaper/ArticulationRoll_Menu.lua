-- ArticulationRoll — pop-up menu (assign / clear / rebuild / edit map).
-- Bind to a key or toolbar button. Loads the shared engine next to this file.
local sep  = package.config:sub(1, 1)
local here = ({reaper.get_action_context()})[2]:match("(.*" .. sep .. ")")
local ART  = dofile(here .. "ArticulationRoll_lib.lua")
ART.run("menu")
