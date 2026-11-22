--[[

Niveau 2

--]]

map          = "level2.tmx"   -- Map
music        = "game"   -- Musique de dÃ©part
objective    = 2              -- Objectif en diamants
progression  = 0              -- Variable de progression
levelName    = "Niveau 2"     -- Nom pour stocker les records en ligne
nextLevel    = ""   -- Niveau Suivant

-- Cette fonction est appelÃ©e au dÃ©but de la partie --
function init()
	dwarf.addMoney(35000)  -- Argent de dÃ©part
end

-- Cette fonction est appelÃ©e Ã  chaque fois que la map est chargÃ©e --
function setup()
	dwarf.moveCamera(71,10,0.75) -- Position de dÃ©part de la camÃ©ra
	dwarf.restoreGui()
end

-- Fonction appelÃ©e en boucle
function run()

end