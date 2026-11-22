--[[

Niveau 1

--]]

map          = "level1.tmx"   -- Map
music        = "game"   -- Musique de dÃ©part
objective    = 7              -- Objectif en diamants
progression  = 0              -- Variable de progression
levelName    = "Niveau 1"     -- Nom pour stocker les records en ligne
nextLevel    = "level2.lua"   -- Niveau Suivant

-- Cette fonction est appelÃ©e au dÃ©but de la partie --
function init()
	dwarf.addMoney(15000)  -- Argent de dÃ©part
end

-- Cette fonction est appelÃ©e Ã  chaque fois que la map est chargÃ©e --
function setup()
	dwarf.moveCamera(22,8,0.5) -- Position de dÃ©part de la camÃ©ra
	dwarf.restoreGui()
end

-- Fonction appelÃ©e en boucle
function run()

end
