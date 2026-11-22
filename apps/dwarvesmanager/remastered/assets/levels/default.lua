--[[

TUTORIAL 4

--]]

map          = "default.tmx"  -- Map
music        = "game"   -- Musique de dÃ©part
objective    = 1              -- Objectif en diamants
progression  = 0              -- Variable de progression
levelName    = "Random Level" -- Nom pour stocker les records en ligne
nextLevel    = "tuto5.lua"    -- Niveau Suivant

-- Cette fonction est appelÃ©e au dÃ©but de la partie --
function init()
	dwarf.addMoney(15000)  -- Argent de dÃ©part
end

-- Cette fonction est appelÃ©e Ã  chaque fois que la map est chargÃ©e --
function setup()
	dwarf.moveCamera(13,13,0.5) -- Position de dÃ©part de la camÃ©ra
end

-- Fonction appelÃ©e en boucle
function run()
	
end


