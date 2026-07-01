-- ArticulationRoll — rebuild all keyswitches (run after moving/resizing notes). Bind to a key.
local sep  = package.config:sub(1, 1)
local here = ({reaper.get_action_context()})[2]:match("(.*" .. sep .. ")")
local ART  = dofile(here .. "ArticulationRoll_lib.lua")
ART.run("rebuild")
