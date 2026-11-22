--[[

TUTORIAL 4

--]]

map          = "tuto4.tmx"    -- Map
music        = "tuto"   -- Musique de dÃ©part
objective    = 1              -- Objectif en diamants
progression  = 0              -- Variable de progression
levelName    = "Tutorial 4"   -- Nom pour stocker les records en ligne
nextLevel    = "tuto5.lua"    -- Niveau Suivant

-- Cette fonction est appelÃ©e au dÃ©but de la partie --
function init()
	dwarf.addMoney(15000)  -- Argent de dÃ©part
	if dwarf.getLang() == "fr" then
		dwarf.popup("Tutorial 4 : En route vers la fortune", "Certains blocs contiennent des gemmes\nqui vous rapporteront de l'argent !")
	else
		dwarf.popup("Tutorial 4 : How to become rich ?", "Some blocks contains gems\nwhich will yield you extra money !")
	end
end

-- Cette fonction est appelÃ©e Ã  chaque fois que la map est chargÃ©e --
function setup()
	dwarf.moveCamera(13,13,0.5) -- Position de dÃ©part de la camÃ©ra
	dwarf.restoreGui()
	dwarf.disableRoom()
	dwarf.disableObjects()
	dwarf.configure("Miner", true)
	dwarf.configure("Barman", false)
	dwarf.configure("Craftman", false)
	dwarf.configure("Enchanter", false)
	dwarf.configure("Hearth", false)
end

-- Fonction appelÃ©e en boucle
function run()
	-- Eviter les besoins de sommeil et biere sur les premiers tutos 
	i = 0
	while i < dwarf.dwarfCount() do
		dwarf.setSleepNeed(i,0)
		dwarf.setThirstNeed(i,0)
		i = i +1
	end
end
