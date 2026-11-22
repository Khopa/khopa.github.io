const STR = {
  en: {
    play: 'Play', continue: 'Continue', options: 'Options', credits: 'Credits', back: 'Back',
    chooseLevel: 'Choose a level', resume: 'Resume', save: 'Save', restart: 'Restart', quit: 'Quit to menu',
    paused: 'Paused', language: 'Language', music: 'Music', sfx: 'Sound effects', quality: 'Graphics',
    auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High', gauges: 'Show needs gauges', always: 'Always', warn: 'When needed',
    money: 'Gold', diamonds: 'Diamonds', wagesIn: 'Wages in', time: 'Time',
    DayEnd: 'End of the day', Wages: 'Wages: ', Grant: "Kingdom's grant: ", Total: 'Total: ',
    Saved: 'Game saved', loading: 'Digging the mine…',
    Miner: 'Miner', Barman: 'Bartender', Craftman: 'Craftsman', Enchanter: 'Enchanter',
    Dorm: 'Dorm', Tavern: 'Tavern', Workshop: 'Workshop',
    Bed: 'Bed', TableObject: 'Table', Barrel: 'Barrel', Anvil: 'Anvil', Rack: 'Rack', Counter: 'Counter', Hearth: 'Hearth',
    Pickaxe: 'Pickaxe', Beer: 'Beer',
    tDwarves: 'Dwarves', tRooms: 'Rooms', tObjects: 'Objects', tMine: 'Dig', tErase: 'Remove', tBack: 'Back', tRotate: 'Rotate',
    hintMine: 'Drag over rock to mark it for digging. Dark bedrock cannot be dug.',
    hintMineErase: 'Drag to cancel digging orders.',
    hintRoom: 'Drag over open floor to build: {0}.',
    hintRoomErase: 'Drag to remove room zones.',
    hintObject: 'Tap the floor to place: {0}. Rotate with R or the button.',
    hintObjectErase: 'Tap an object to sell it back (full refund).',
    hintRecruit: 'Tap the floor to hire: {0}.',
    hintRecruitErase: 'Tap a dwarf to dismiss them (severance pay).',
    hintChooseRoom: 'Choose a room type, then drag on the floor.',
    hintChooseObject: 'Choose an object to place.',
    hintChooseDwarf: 'Choose who to hire.',
    perDay: '/day', hire: 'Hire', fee: 'fee', salary: 'Salary', severance: 'Severance',
    sleep: 'Fatigue', thirst: 'Thirst', item: 'Holding', nothing: 'Nothing', enchanted: 'enchanted', wear: 'wear',
    follow: 'Follow', dismiss: 'Dismiss', close: 'Close',
    ready: 'Ready', needs: 'Needs', room: 'Room', none: 'none', contents: 'Contents', sell: 'Sell',
    complaint0: 'No free bed!', complaint1: "Can't get there!", complaint2: 'No pickaxe!', complaint3: 'No beer!', complaint4: 'Something is wrong!',
    act: {
      idle: 'Waiting for orders', complaining: 'Complaining', thirsty: 'Thirsty', goingToTavern: 'Heading to the tavern',
      waitingForBeer: 'Waiting for a beer', goingToTable: 'Looking for a seat', drinking: 'Drinking', sleepy: 'Sleepy',
      goingToDorm: 'Heading to bed', sleeping: 'Sleeping', lookingForPickaxe: 'Looking for a pickaxe', goingToMine: 'Going to dig',
      mining: 'Digging', goingToWorkshop: 'Going to the workshop', repairing: 'Repairing a pickaxe', crafting: 'Forging a pickaxe',
      storingPickaxe: 'Storing a pickaxe', lookingForBar: 'Looking for a counter', goingToBar: 'Going to the counter',
      cleaning: 'Wiping the counter', fetchingBeer: 'Pouring a beer', lookingForPickaxes: 'Looking for pickaxes', enchanting: 'Enchanting',
    },
    victory: 'Victory!', defeat: 'Bankrupt!', victoryText: 'All the diamonds you needed are safe in the vault.',
    defeatText: 'Your treasury ran dry. The dwarves went home.',
    yourTime: 'Your time', best: 'Best', next: 'Next level', retry: 'Retry', menu: 'Menu', newRecord: 'New record!',
    savedGame: 'Saved game', resumeSaved: 'Resume', newGame: 'New game', completed: 'Completed',
    ok: 'OK', creditsText: 'Original game by Khopa (Clément Perreau), for Android & Desktop.<br>Remastered edition built with three.js. Level scripts, music and sounds from the original game.',
    controlsTitle: 'Controls',
    controlsText: 'Drag or WASD: move · Wheel or pinch: zoom · Q/E, right-drag or two-finger twist: rotate<br>Space: pause · 1-3: speed · R: rotate object · Esc: back',
    objective: 'Goal: {0} diamonds',
    speed: 'Speed', pause: 'Pause',
  },
  fr: {
    play: 'Jouer', continue: 'Continuer', options: 'Options', credits: 'Crédits', back: 'Retour',
    chooseLevel: "Choix d'un niveau", resume: 'Reprendre', save: 'Sauvegarder', restart: 'Recommencer', quit: 'Quitter vers le menu',
    paused: 'Pause', language: 'Langue', music: 'Musique', sfx: 'Effets sonores', quality: 'Graphismes',
    auto: 'Auto', low: 'Bas', medium: 'Moyen', high: 'Élevé', gauges: 'Jauges de besoins', always: 'Toujours', warn: 'Si besoin',
    money: 'Or', diamonds: 'Diamants', wagesIn: 'Salaires dans', time: 'Temps',
    DayEnd: 'Fin de la journée', Wages: 'Salaires : ', Grant: 'Subventions du royaume : ', Total: 'Total : ',
    Saved: 'Partie sauvegardée', loading: 'Creusement de la mine…',
    Miner: 'Mineur', Barman: 'Barman', Craftman: 'Artisan', Enchanter: 'Enchanteur',
    Dorm: 'Dortoir', Tavern: 'Taverne', Workshop: 'Atelier',
    Bed: 'Lit', TableObject: 'Table', Barrel: 'Fût', Anvil: 'Enclume', Rack: 'Râtelier', Counter: 'Comptoir', Hearth: 'Foyer',
    Pickaxe: 'Pioche', Beer: 'Bière',
    tDwarves: 'Nains', tRooms: 'Pièces', tObjects: 'Objets', tMine: 'Creuser', tErase: 'Retirer', tBack: 'Retour', tRotate: 'Tourner',
    hintMine: 'Glissez sur la roche pour la faire creuser. La roche noire est indestructible.',
    hintMineErase: 'Glissez pour annuler des ordres de creusage.',
    hintRoom: 'Glissez sur le sol pour construire : {0}.',
    hintRoomErase: 'Glissez pour supprimer des zones de pièces.',
    hintObject: 'Touchez le sol pour placer : {0}. Tournez avec R ou le bouton.',
    hintObjectErase: 'Touchez un objet pour le revendre (remboursé).',
    hintRecruit: 'Touchez le sol pour embaucher : {0}.',
    hintRecruitErase: 'Touchez un nain pour le renvoyer (indemnités).',
    hintChooseRoom: 'Choisissez une pièce puis glissez sur le sol.',
    hintChooseObject: 'Choisissez un objet à placer.',
    hintChooseDwarf: 'Choisissez qui embaucher.',
    perDay: '/jour', hire: 'Embaucher', fee: 'prime', salary: 'Salaire', severance: 'Indemnités',
    sleep: 'Fatigue', thirst: 'Soif', item: 'Tient', nothing: 'Rien', enchanted: 'enchantée', wear: 'usure',
    follow: 'Suivre', dismiss: 'Renvoyer', close: 'Fermer',
    ready: 'Prête', needs: 'Manque', room: 'Pièce', none: 'aucune', contents: 'Contenu', sell: 'Vendre',
    complaint0: 'Pas de lit libre !', complaint1: 'Impossible d\'y aller !', complaint2: 'Pas de pioche !', complaint3: 'Pas de bière !', complaint4: 'Quelque chose cloche !',
    act: {
      idle: 'Attend des ordres', complaining: 'Râle', thirsty: 'A soif', goingToTavern: 'Va à la taverne',
      waitingForBeer: 'Attend sa bière', goingToTable: 'Cherche une place', drinking: 'Boit', sleepy: 'A sommeil',
      goingToDorm: 'Va se coucher', sleeping: 'Dort', lookingForPickaxe: 'Cherche une pioche', goingToMine: 'Va creuser',
      mining: 'Creuse', goingToWorkshop: "Va à l'atelier", repairing: 'Répare une pioche', crafting: 'Forge une pioche',
      storingPickaxe: 'Range une pioche', lookingForBar: 'Cherche un comptoir', goingToBar: 'Va au comptoir',
      cleaning: 'Essuie le comptoir', fetchingBeer: 'Tire une bière', lookingForPickaxes: 'Cherche des pioches', enchanting: 'Enchante',
    },
    victory: 'Victoire !', defeat: 'Faillite !', victoryText: 'Les diamants sont en sécurité dans le coffre.',
    defeatText: 'Le trésor est vide. Les nains sont rentrés chez eux.',
    yourTime: 'Votre temps', best: 'Record', next: 'Niveau suivant', retry: 'Rejouer', menu: 'Menu', newRecord: 'Nouveau record !',
    savedGame: 'Partie sauvegardée', resumeSaved: 'Reprendre', newGame: 'Nouvelle partie', completed: 'Terminé',
    ok: 'OK', creditsText: "Jeu original par Khopa (Clément Perreau), pour Android et PC.<br>Édition Remastered réalisée avec three.js. Scripts de niveaux, musiques et sons du jeu original.",
    controlsTitle: 'Contrôles',
    controlsText: 'Glisser ou ZQSD/WASD : déplacer · Molette ou pincer : zoom · A/E, clic droit ou rotation à deux doigts : tourner<br>Espace : pause · 1-3 : vitesse · R : tourner l\'objet · Échap : retour',
    objective: 'Objectif : {0} diamants',
    speed: 'Vitesse', pause: 'Pause',
  },
};

let lang = 'en';
export function setLang(l) {
  lang = STR[l] ? l : 'en';
  document.documentElement.lang = lang;
}
export function getLang() {
  return lang;
}
export function t(key, ...args) {
  let s = key.split('.').reduce((o, k) => (o ? o[k] : undefined), STR[lang]);
  if (s === undefined) s = key.split('.').reduce((o, k) => (o ? o[k] : undefined), STR.en) ?? key;
  return args.reduce((acc, a, i) => acc.replace('{' + i + '}', a), s);
}
export function detectLang() {
  return (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
