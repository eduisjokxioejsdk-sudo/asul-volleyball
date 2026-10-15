// ============================================================================
// Formation — contenu des leçons DataVolley (style Duolingo) + générateur de
// « leçon de rappel ». Données pures (aucun React) ; l'UI est dans TrainingPage.
//
// Une leçon : { id, title, subtitle, color, theory[], practice[], eval[] }
//   theory   : diapos (5-7) { title, text, code?, meaning? }
//   practice : formules à taper 3× { code, meaning }
//   eval     : 10 traductions { prompt, answer }  (answer = code ou suite de codes)
// ============================================================================

import { parseSequence } from './datavolley.js';

const L1 = {
  id: 'l1',
  title: 'Le squelette d’un code',
  subtitle: 'Équipe · numéro · action · évaluation',
  color: '#4c9be8',
  theory: [
    { title: 'À quoi sert un code ?', text: 'Chaque action d’un joueur se décrit par UN code DataVolley. Il se lit de gauche à droite : d’abord l’équipe, puis le numéro du joueur, puis l’action, puis la qualité (l’évaluation).', code: '*05S+', meaning: 'n°5, domicile, service, bien joué' },
    { title: 'L’équipe (facultative !)', text: '« * » = ton équipe (domicile). « a » = l’équipe adverse (extérieur). Astuce : tu peux OMETTRE le « * » — un code qui commence par un chiffre est forcément ton équipe : « 05S+ » = « *05S+ ».', code: 'a12R+', meaning: 'n°12, équipe adverse, réception, positive' },
    { title: 'Le numéro du joueur', text: 'Le numéro de maillot, de 1 à 99. C’est toujours ce qui suit l’équipe (on écrit 5 → 05 au besoin).', code: '*09A+', meaning: 'le n°9 de ton équipe attaque' },
    { title: 'Les 7 actions', text: 'S = Service · R = Réception · A = Attaque · B = Contre · D = Défense · E = Passe · F = Ballon libre (balle renvoyée sans attaque).', code: '*07E+', meaning: 'le n°7 fait la passe' },
    { title: 'L’évaluation (aperçu)', text: 'En dernière position vient la qualité de l’action. Tous les symboles sont vus à la leçon 2 ; ici on utilise « + » (positive).', code: '*11B+', meaning: 'le n°11 contre, positif' },
    { title: 'À retenir', text: 'Ordre FIXE : équipe → numéro → action → évaluation. Sans évaluation, le code est incomplet.', code: '*03F+', meaning: 'le n°3 joue un ballon libre' },
  ],
  practice: [
    { code: '*02S+', meaning: 'le n°2 sert, positif' },
    { code: 'a04R+', meaning: 'le n°4 adverse reçoit, positif' },
    { code: '*06A+', meaning: 'le n°6 attaque, positif' },
    { code: 'a09B+', meaning: 'le n°9 adverse contre, positif' },
    { code: '*08D+', meaning: 'le n°8 défend, positif' },
    { code: 'a03E+', meaning: 'le n°3 adverse passe, positif' },
    { code: '*11F+', meaning: 'le n°11 joue un ballon libre, positif' },
    { code: 'a07A+', meaning: 'le n°7 adverse attaque, positif' },
    { code: '*10R+', meaning: 'le n°10 reçoit, positif' },
    { code: 'a12S+', meaning: 'le n°12 adverse sert, positif' },
  ],
  eval: [
    { prompt: 'Le n°4 à domicile sert', answer: '*04S+' },
    { prompt: 'Le n°8 extérieur reçoit', answer: 'a08R+' },
    { prompt: 'Le n°6 attaque', answer: '*06A+' },
    { prompt: 'Le n°10 extérieur passe', answer: 'a10E+' },
    { prompt: 'Le n°1 contre', answer: '*01B+' },
    { prompt: 'Le n°12 extérieur défend', answer: 'a12D+' },
    { prompt: 'Le n°7 joue un ballon libre', answer: '*07F+' },
    { prompt: 'Le n°3 extérieur sert', answer: 'a03S+' },
    { prompt: 'Le n°5 reçoit', answer: '*05R+' },
    { prompt: 'Le n°9 extérieur attaque', answer: 'a09A+' },
  ],
};

const L2 = {
  id: 'l2',
  title: 'Les évaluations',
  subtitle: 'La qualité de l’action : # + ! − / =',
  color: '#e8a33d',
  theory: [
    { title: 'Les 6 symboles', text: 'L’évaluation termine le code et dit la qualité de l’action : « # » excellent (souvent le point), « + » positif, « ! » neutre/OK, « − » négatif, « / » mauvais, « = » faute.', code: '*04S#', meaning: 'service gagnant (ace)' },
    { title: '« # » et « = » : les extrêmes', text: '« # » = le meilleur résultat pour la compétence (ace, attaque gagnante, contre gagnant…). « = » = la faute : le point est perdu.', code: '*04S=', meaning: 'service faute' },
    { title: '⚠️ Pas d’action « faute »', text: 'Il n’existe AUCUNE action « faute ». Une faute se code avec l’évaluation « = » SUR l’action concernée. Et attention : « F » = ballon libre, ce n’est PAS une faute.', code: '*09A=', meaning: 'attaque faute (balle dehors)' },
    { title: 'L’ordre de qualité', text: 'Du meilleur au pire : # (excellent) → + (positif) → ! (neutre) → − (négatif) → / (mauvais) → = (faute).', code: '*09A/', meaning: 'attaque contrée (le contre adverse marque)' },
    { title: 'Au service', text: 'Service : # = ace (point direct), = = faute de service, les autres selon la difficulté imposée au receveur.', code: 'a08R#', meaning: 'réception extérieure parfaite' },
    { title: 'En attaque', text: 'Attaque : # = point gagnant, / = contrée (le contre adverse la stoppe), = = faute (ballon hors du terrain ou filet).', code: '*11B#', meaning: 'contre gagnant' },
    { title: 'À retenir', text: 'Même action, évaluations différentes = résultats opposés. « # » récompense, « = » pénalise.', code: 'a02D#', meaning: 'défense extérieure parfaite' },
  ],
  practice: [
    { code: '*06S#', meaning: 'ace du n°6' },
    { code: 'a03S=', meaning: 'faute de service du n°3 adverse' },
    { code: '*08R=', meaning: 'réception ratée du n°8' },
    { code: 'a05A#', meaning: 'attaque gagnante du n°5 adverse' },
    { code: '*07A/', meaning: 'attaque contrée du n°7' },
    { code: 'a09A=', meaning: 'faute d’attaque du n°9 adverse' },
    { code: '*12B#', meaning: 'contre gagnant du n°12' },
    { code: 'a02D#', meaning: 'défense parfaite du n°2 adverse' },
    { code: '*10E#', meaning: 'passe parfaite du n°10' },
    { code: 'a11R=', meaning: 'réception ratée du n°11 adverse' },
  ],
  eval: [
    { prompt: 'Ace du n°4 (service gagnant)', answer: '*04S#' },
    { prompt: 'Faute de service du n°4', answer: '*04S=' },
    { prompt: 'Réception parfaite du n°8 extérieur', answer: 'a08R#' },
    { prompt: 'Réception ratée du n°8 extérieur', answer: 'a08R=' },
    { prompt: 'Attaque gagnante du n°9', answer: '*09A#' },
    { prompt: 'Attaque contrée du n°9', answer: '*09A/' },
    { prompt: 'Attaque faute du n°9', answer: '*09A=' },
    { prompt: 'Contre gagnant du n°11', answer: '*11B#' },
    { prompt: 'Défense parfaite du n°2 extérieur', answer: 'a02D#' },
    { prompt: 'Passe parfaite du n°7', answer: '*07E#' },
  ],
};

const L3 = {
  id: 'l3',
  title: 'Le service complet',
  subtitle: 'Type de service + zone visée',
  color: '#5fbf87',
  theory: [
    { title: 'Le service, point de départ', text: 'Chaque point commence par un service « S » : c’est le premier code de tout échange.', code: '*04S', meaning: 'le n°4 sert' },
    { title: 'Le type de service (une lettre)', text: 'Après le « S », on peut préciser le TYPE (une lettre) : H = flottante, Q = smashée (jump), M = jump float, T = tennis.', code: '*04SM', meaning: 'n°4, service smashé' },
    { title: 'La zone visée (1 chiffre)', text: 'Au service, UN chiffre = la zone où le ballon arrive (1 à 9). La zone de départ est toujours la 1, donc inutile de l’écrire.', code: '*04SM5', meaning: 'n°4, smashé, vers la zone 5' },
    { title: 'Les 4 types en détail', text: 'H : flottante (à l’arrêt). Q : smashée, sautée, avec rotation. M : jump float (sautée + flottante). T : « tennis » (lancer haut puis flottante sautée).', code: 'a08SQ', meaning: 'n°8 adverse, service smashé' },
    { title: 'Assembler', text: 'Service → type → zone → évaluation. Ex. : n°4 smashé vers la zone 5, ace → « *04SM5# ».', code: '*04SM5#', meaning: 'ace du n°4 en zone 5' },
    { title: 'À retenir', text: 'Le type est facultatif, la zone aussi, mais l’évaluation est obligatoire. Ordre : S + type + zone + éval.', code: '*04ST9=', meaning: 'n°4, tennis en zone 9, faute' },
  ],
  practice: [
    { code: '*05SH3#', meaning: 'n°5 flottant en zone 3, ace' },
    { code: '*09SQ7+', meaning: 'n°9 smashé en zone 7, positif' },
    { code: 'a06SM2#', meaning: 'n°6 adverse jump float en zone 2, ace' },
    { code: '*03ST4=', meaning: 'n°3 tennis en zone 4, faute' },
    { code: 'a08SH8+', meaning: 'n°8 adverse flottant en zone 8, positif' },
    { code: '*11SM6#', meaning: 'n°11 smashé en zone 6, ace' },
    { code: '*02SQ1+', meaning: 'n°2 smashé en zone 1, positif' },
    { code: 'a10ST5=', meaning: 'n°10 adverse tennis en zone 5, faute' },
    { code: '*07SH9#', meaning: 'n°7 flottant en zone 9, ace' },
    { code: 'a04SM7+', meaning: 'n°4 adverse smashé en zone 7, positif' },
  ],
  eval: [
    { prompt: 'Le n°4 smashé en zone 5, ace', answer: '*04SM5#' },
    { prompt: 'Le n°4 flottant en zone 6', answer: '*04SH6+' },
    { prompt: 'Le n°8 extérieur smashé en zone 1, ace', answer: 'a08SQ1#' },
    { prompt: 'Le n°4 tennis en zone 9, faute', answer: '*04ST9=' },
    { prompt: 'Le n°6 jump float en zone 1', answer: '*06SM1+' },
    { prompt: 'Le n°10 extérieur flottant en zone 5', answer: 'a10SH5+' },
    { prompt: 'Le n°4 smashé en zone 7', answer: '*04SM7+' },
    { prompt: 'Le n°8 extérieur jump float en zone 6, ace', answer: 'a08SM6#' },
    { prompt: 'Le n°4 flottant en zone 1, faute', answer: '*04SH1=' },
    { prompt: 'Le n°10 extérieur tennis en zone 9', answer: 'a10ST9+' },
  ],
};

const L4 = {
  id: 'l4',
  title: 'Formule combinée service · réception',
  subtitle: 'Deux actions en une seule frappe',
  color: '#b06fd6',
  theory: [
    { title: 'Coder 2 actions d’un coup', text: 'Le service et la réception vont toujours ensemble. Un point « . » permet de les coder en UNE frappe, sans séparer.', code: '*12S.10+', meaning: 'n°12 sert, n°10 adverse reçoit +' },
    { title: 'Comment ça marche', text: 'À gauche du point : ton service (n° + S). À droite du point : le numéro du receveur adverse + son évaluation. Ex. « *12S.10+ ».', code: '*12S.10#', meaning: 'réception adverse parfaite → service déduit « − »' },
    { title: 'L’évaluation du service est DÉDUITE', text: 'Tu ne tapes QUE l’évaluation de la réception. Celle du service en découle automatiquement (relation inverse) : une réception parfaite = un service facile.', code: '*12S.10-', meaning: 'réception « − » → service « + »' },
    { title: 'La table de correspondance', text: 'Réception → Service : = → # (ace) · / → + · − → + · ! → ! · + → − · # → −. Mémorise surtout les extrêmes : une réception ratée = un ace.', code: '*12S.10=', meaning: 'réception ratée → service ACE (#)' },
    { title: 'Le receveur est toujours ADVERSE', text: 'Après le point, le numéro est un joueur de l’ÉQUIPE ADVERSE (l’équipe « a » si tu es « * »). Pas besoin de taper sa clé d’équipe.', code: 'a05S.09#', meaning: 'n°5 adverse sert, n°9 (toi) reçoit parfaitement' },
    { title: 'Astuce vitesse', text: 'C’est LA formule qui fait gagner un temps énorme : la moitié du match tient dans ces doubles codes. Entraîne-toi à la taper sans réfléchir.', code: '*12S.10+', meaning: 'réflexe n°1 du statisticien' },
    { title: 'À retenir', text: 'Format : service + « . » + n° receveur adverse + évaluation de la réception. Le reste se déduit.', code: '*04ST9.12=', meaning: 'n°4 tennis en zone 9, n°12 adverse rate' },
  ],
  practice: [
    { code: '*09S.05#', meaning: 'n°9 sert, n°5 adverse reçoit parfaitement' },
    { code: '*09S.05=', meaning: 'n°9 sert, n°5 adverse rate (ace)' },
    { code: 'a08S.11-', meaning: 'n°8 adverse sert, n°11 reçoit mal' },
    { code: '*03SM5.07+', meaning: 'n°3 smashé en zone 5, n°7 adverse reçoit bien' },
    { code: '*11SH2.09#', meaning: 'n°11 flottant en zone 2, n°9 adverse reçoit parfaitement' },
    { code: 'a06S.10+', meaning: 'n°6 adverse sert, n°10 reçoit bien' },
    { code: '*12ST9.04=', meaning: 'n°12 tennis en zone 9, n°4 adverse rate' },
    { code: 'a05S.02-', meaning: 'n°5 adverse sert, n°2 reçoit mal' },
    { code: '*07SQ1.08#', meaning: 'n°7 smashé en zone 1, n°8 adverse reçoit parfaitement' },
    { code: 'a09S.06+', meaning: 'n°9 adverse sert, n°6 reçoit bien' },
  ],
  eval: [
    { prompt: 'Le n°12 sert, le n°10 adverse reçoit bien', answer: '*12S.10+' },
    { prompt: 'Le n°12 sert, le n°10 adverse reçoit parfaitement', answer: '*12S.10#' },
    { prompt: 'Le n°12 sert, le n°10 adverse rate sa réception', answer: '*12S.10=' },
    { prompt: 'Le n°5 extérieur sert, le n°9 à domicile reçoit parfaitement', answer: 'a05S.09#' },
    { prompt: 'Le n°7 smashé en zone 6, le n°3 adverse reçoit mal', answer: '*07SM6.03-' },
    { prompt: 'Le n°4 flottant en zone 5, le n°8 adverse reçoit bien', answer: '*04SH5.08+' },
    { prompt: 'Le n°3 extérieur sert, le n°11 à domicile reçoit mal', answer: 'a03S.11-' },
    { prompt: 'Le n°6 smashé en zone 1, le n°2 adverse reçoit parfaitement', answer: '*06SM1.02#' },
    { prompt: 'Le n°10 extérieur sert, le n°7 à domicile reçoit mal', answer: 'a10S.07-' },
    { prompt: 'Le n°9 tennis en zone 9, le n°12 adverse rate', answer: '*09ST9.12=' },
  ],
};

const L5 = {
  id: 'l5',
  title: 'Réception et passe',
  subtitle: 'Le 1ᵉʳ et le 2ᵉ contact',
  color: '#e8734c',
  theory: [
    { title: 'La réception (R)', text: 'La réception est le PREMIER contact sur le service adverse. Elle se code « R » avec une évaluation.', code: 'a08R#', meaning: 'réception parfaite du n°8 adverse' },
    { title: 'Les évaluations de la réception', text: '« # » parfaite (toutes les options ouvertes) · « + » positive (petit déplacement du passeur) · « ! » OK (1ᵉʳ tempo impossible) · « − » négative (attaque limitée) · « / » mauvaise · « = » ratée.', code: '*05R+', meaning: 'réception positive du n°5' },
    { title: 'La passe (E)', text: 'La passe est le DEUXIÈME contact : le passeur distribue. Elle se code « E », généralement par le passeur de l’équipe.', code: '*07E#', meaning: 'passe parfaite du n°7 (passeur)' },
    { title: 'La zone de la passe', text: 'La passe peut porter UNE zone : la cible, c’est-à-dire où le passeur envoie le ballon (souvent la où l’attaquant va frapper).', code: 'a10E2#', meaning: 'passe du n°10 adverse vers la zone 2' },
    { title: 'Réception → passe', text: 'Après une réception, c’est la MÊME équipe qui passe. Donc si la réception est « a », la passe est « a » aussi (sauf changement de camp après un point).', code: '*07E4+', meaning: 'le n°7 passe vers la zone 4' },
    { title: 'À retenir', text: 'R = 1ᵉʳ contact (sur le service) · E = 2ᵉ contact (le passeur). Les deux ont une évaluation obligatoire.', code: '*05R#', meaning: 'boum, réception parfaite' },
  ],
  practice: [
    { code: 'a11R#', meaning: 'réception parfaite du n°11 adverse' },
    { code: '*04R!', meaning: 'réception neutre du n°4' },
    { code: 'a09R=', meaning: 'réception ratée du n°9 adverse' },
    { code: '*02E2#', meaning: 'passe parfaite du n°2 vers la zone 2' },
    { code: 'a07E4+', meaning: 'passe du n°7 adverse vers la zone 4, positive' },
    { code: '*10E3!', meaning: 'passe neutre du n°10 vers la zone 3' },
    { code: '*06R/', meaning: 'réception mauvaise du n°6' },
    { code: 'a03E#', meaning: 'passe parfaite du n°3 adverse' },
    { code: '*12E4-', meaning: 'passe négative du n°12 vers la zone 4' },
    { code: 'a05R+', meaning: 'réception positive du n°5 adverse' },
  ],
  eval: [
    { prompt: 'Réception parfaite du n°8 extérieur', answer: 'a08R#' },
    { prompt: 'Réception positive du n°5', answer: '*05R+' },
    { prompt: 'Réception limitée du n°2 extérieur', answer: 'a02R-' },
    { prompt: 'Réception ratée du n°10', answer: '*10R=' },
    { prompt: 'Passe parfaite du passeur n°7', answer: '*07E#' },
    { prompt: 'Passe positive du passeur n°10 extérieur', answer: 'a10E+' },
    { prompt: 'Le n°7 passe vers la zone 4', answer: '*07E4+' },
    { prompt: 'Le passeur n°10 extérieur passe vers la zone 2', answer: 'a10E2#' },
    { prompt: 'Réception parfaite du n°9 extérieur', answer: 'a09R#' },
    { prompt: 'Passe faute du n°7', answer: '*07E=' },
  ],
};

const L6 = {
  id: 'l6',
  title: 'L’attaque',
  subtitle: 'Type + zones de départ et d’arrivée + sous-zone',
  color: '#c8965c',
  theory: [
    { title: 'L’attaque (A)', text: 'L’attaque est le 3ᵉ contact offensif (ou le 2ᵉ après une défense). Elle se code « A ».', code: '*09A', meaning: 'le n°9 attaque' },
    { title: 'Le type d’attaque', text: 'Une lettre après le « A » : H = frappée (forte), P = placée (feinte/roulade), T = tendue (rapide, le long du filet).', code: '*09AP', meaning: 'n°9, attaque placée' },
    { title: 'DEUX zones (départ + arrivée)', text: 'Pour une attaque, on écrit DEUX chiffres : le 1ᵉʳ = la zone de DÉPART (d’où l’on saute), le 2ᵉ = la zone d’ARRIVÉE (où va la balle).', code: '*09A45', meaning: 'attaque depuis la zone 4 vers la zone 5' },
    { title: 'La sous-zone A-D (facultative)', text: 'Après les 2 zones, une lettre A/B/C/D précise la direction fine dans la zone d’arrivée.', code: '*09A45B', meaning: 'zone 4 → 5, direction B' },
    { title: 'Assembler', text: 'Attaque → type → zone départ → zone arrivée → sous-zone → évaluation. Ex. : n°9 frappée 4 → 5, point → « *09AH45# ».', code: '*09AH45#', meaning: 'attaque frappée 4 → 5, point gagnant' },
    { title: 'À retenir', text: 'Une seule zone = zone de départ. Deux zones = départ PUIS arrivée. Le type et la sous-zone sont facultatifs.', code: '*09A#', meaning: 'n°9 attaque (sans détail)' },
  ],
  practice: [
    { code: '*04AH6#', meaning: 'n°4 frappée depuis la zone 6, gagnante' },
    { code: '*11AP45+', meaning: 'n°11 placée des zones 4 → 5' },
    { code: 'a07AT2#', meaning: 'n°7 adverse tendue depuis la zone 2, gagnante' },
    { code: '*09A38#', meaning: 'n°9 des zones 3 → 8, gagnante' },
    { code: 'a12AH4/', meaning: 'n°12 adverse frappée depuis la zone 4, contrée' },
    { code: '*05AP21+', meaning: 'n°5 placée des zones 2 → 1' },
    { code: '*10A5#', meaning: 'n°10 attaque depuis la zone 5, gagnante' },
    { code: 'a02AT6=', meaning: 'n°2 adverse tendue depuis la zone 6, faute' },
    { code: '*08AH49C#', meaning: 'n°8 frappée des zones 4 → 9, direction C' },
    { code: 'a06A45+', meaning: 'n°6 adverse des zones 4 → 5' },
  ],
  eval: [
    { prompt: 'Le n°9 attaque frappée depuis la zone 4, gagnante', answer: '*09AH4#' },
    { prompt: 'Le n°9 attaque placée des zones 4 vers 5', answer: '*09AP45#' },
    { prompt: 'Le n°9 attaque des zones 4 vers 5, sous-zone B', answer: '*09A45B#' },
    { prompt: 'Le n°10 extérieur attaque tendue depuis la zone 2', answer: 'a10AT2+' },
    { prompt: 'Le n°6 attaque frappée des zones 3 vers 8', answer: '*06AH38#' },
    { prompt: 'Le n°4 extérieur attaque placée des zones 2 vers 1', answer: 'a04AP21+' },
    { prompt: 'Le n°11 attaque depuis la zone 6', answer: '*11A6+' },
    { prompt: 'Le n°7 attaque frappée des zones 4 vers 9, sous-zone C', answer: '*07AH49C#' },
    { prompt: 'Le n°3 extérieur attaque des zones 4 vers 5', answer: 'a03A45+' },
    { prompt: 'Le n°9 attaque tendue des zones 2 vers 6', answer: '*09AT26+' },
  ],
};

const L7 = {
  id: 'l7',
  title: 'Les combinaisons d’attaque',
  subtitle: 'Deux lettres qui remplacent type + zone',
  color: '#7a9e3d',
  theory: [
    { title: 'Une lettre + un chiffre = tout', text: 'Une COMBINAISON est un code de 2 caractères qui décrit le système offensif. En l’écrivant après le « A », la zone de départ ET le type sont remplis automatiquement.', code: '*09AX1#', meaning: 'n°9, « A Quick », point gagnant' },
    { title: 'Ailes (réceptionneur / pointu)', text: 'X5 = rapide en zone 4 · V5 = haute en zone 4 · X6 = rapide en zone 2 · V6 = haute en zone 2 · X8 = rapide en zone 1 · V8 = haute en zone 1.', code: 'a10AV5#', meaning: 'n°10 adverse, haute en zone 4' },
    { title: 'Pipe / arrière (XP, VP)', text: 'XP = pipe rapide (attaque arrière au centre) · VP = pipe haute. Ce sont les attaques du joueur arrière au 6 mètres.', code: '*09AXP+', meaning: 'n°9, pipe rapide' },
    { title: 'Centraux (MB)', text: 'X1 = 1ʳᵉ vitesse (A Quick) · X7 = gap · X2 / CF = 1ʳᵉ vitesse derrière le passeur (back quick) · XD / CD = fast. Les centraux attaquent surtout en 1ʳᵉ vitesse.', code: '*09AX1#', meaning: 'n°9 (central), 1ʳᵉ vitesse' },
    { title: 'Lire le code', text: 'X = rapide (1ʳᵉ tempo) ; V = haute (balle haute). Le chiffre : 5 → zone 4 · 6 → zone 2 · 8 → zone 1 · P → pipe.', code: '*09AV6#', meaning: 'n°9, haute en zone 2' },
    { title: 'Pourquoi c’est rapide', text: '2 caractères remplacent « type + zone de départ ». Au lieu de « *09AH4 », tu écris « *09AX5 » — moins de touches, et c’est plus juste.', code: '*09AX5+', meaning: 'n°9, rapide en zone 4' },
    { title: 'À retenir', text: 'La combinaison est prioritaire : on l’écrit juste après « A », et on n’ajoute PAS de type ni de zone de départ.', code: '*09ACB+', meaning: 'n°9, slide (CB)' },
  ],
  practice: [
    { code: '*11AX5#', meaning: 'n°11, rapide en zone 4 (X5)' },
    { code: 'a09AV8+', meaning: 'n°9 adverse, haute en zone 1 (V8)' },
    { code: '*06AX2#', meaning: 'n°6, 1ʳᵉ vitesse derrière le passeur (X2)' },
    { code: '*10AVP+', meaning: 'n°10, pipe haute (VP)' },
    { code: 'a05ACF#', meaning: 'n°5 adverse, fast (CF)' },
    { code: '*03AV6+', meaning: 'n°3, haute en zone 2 (V6)' },
    { code: '*08AX7#', meaning: 'n°8, gap (X7)' },
    { code: 'a11AXP+', meaning: 'n°11 adverse, pipe rapide (XP)' },
    { code: '*09AXD#', meaning: 'n°9, fast (XD)' },
    { code: 'a04AV5+', meaning: 'n°4 adverse, haute en zone 4 (V5)' },
  ],
  eval: [
    { prompt: 'A Quick (1ʳᵉ vitesse) du n°9', answer: '*09AX1#' },
    { prompt: 'Pipe rapide du n°10 extérieur', answer: 'a10AXP#' },
    { prompt: 'Slide du n°9', answer: '*09ACB+' },
    { prompt: 'Haute en zone 4 du n°9', answer: '*09AV5#' },
    { prompt: 'Haute en zone 2 du n°10 extérieur', answer: 'a10AV6+' },
    { prompt: 'Rapide en zone 4 du n°9', answer: '*09AX5+' },
    { prompt: 'Haute en zone 1 du n°10 extérieur', answer: 'a10AV8#' },
    { prompt: '1ʳᵉ vitesse derrière le passeur du n°9', answer: '*09AX2#' },
    { prompt: 'Pipe haute du n°10 extérieur', answer: 'a10AVP+' },
    { prompt: '1ʳᵉ vitesse B au centre du n°9', answer: '*09AXM#' },
  ],
};

const L8 = {
  id: 'l8',
  title: 'Formule combinée attaque · contre/défense',
  subtitle: 'Coder l’attaque ET la réponse adverse d’un coup',
  color: '#c85a8a',
  theory: [
    { title: 'Le même principe que service·réception', text: 'Après une attaque, on code souvent le CONTRE adverse (ou la défense) dans la même frappe, reliés par un point « . ».', code: '*05AV66.12#', meaning: 'n°5 attaque V6 → n°12 adverse CONTRE' },
    { title: 'Par défaut : le contre', text: 'Le point relie l’attaque au CONTRE adverse (c’est le cas par défaut). Le numéro après le point est un joueur de l’équipe adverse.', code: '*11AV5.06#', meaning: 'n°11 attaque, n°6 adverse contre' },
    { title: 'Pour une DÉFENSE, ajoute « D »', text: 'Si la balle est récupérée par la défense (pas au filet), on ajoute « D » après le numéro adverse.', code: '*05AV66.12D#', meaning: 'n°5 attaque, n°12 adverse DÉFEND (#)' },
    { title: 'L’évaluation de l’attaque est DÉDUITE', text: 'Tu ne tapes que l’évaluation du contreur/défenseur. Celle de l’attaque se déduit (inverse) : un contre gagnant (#) = une attaque contrée (/).', code: '*05AV66.12=', meaning: 'contre faute (=) → attaque gagnante (#)' },
    { title: 'Exemples', text: '« *05AV66.12# » : n°5 attaque, n°12 adverse contre pour le point. « *05AV66.12D# » : n°12 défend parfaitement → attaque « − » (facilement défendue).', code: 'a09AX1.03D+', meaning: 'n°9 adverse attaque, n°3 (toi) DÉFEND (+)' },
    { title: 'Astuce vitesse', text: 'Un point complet (attaque + contre/défense) se code en UNE frappe. C’est le second gros gain de vitesse après service·réception.', code: '*05AH4.02D+', meaning: 'attaque frappée, n°2 adverse défend' },
    { title: 'À retenir', text: 'Format : attaque (avec sa combinaison/zone) + « . » + n° adverse + [« D » si défense] + évaluation.', code: '*06AX1.10#', meaning: 'n°6 A Quick, n°10 adverse contre' },
  ],
  practice: [
    { code: '*11AV5.06#', meaning: 'n°11 attaque V5, n°6 adverse contre (point)' },
    { code: '*03AH4.09D+', meaning: 'n°3 attaque frappée, n°9 adverse défend (positif)' },
    { code: 'a08AX1.04#', meaning: 'n°8 adverse A Quick, n°4 (toi) contre (point)' },
    { code: '*06AV6.12D#', meaning: 'n°6 attaque V6, n°12 adverse défend parfaitement' },
    { code: 'a10AXP.05D+', meaning: 'n°10 adverse pipe, n°5 (toi) défend (positif)' },
    { code: '*09AH45.03#', meaning: 'n°9 attaque 4 → 5, n°3 adverse contre (point)' },
    { code: '*02AV5.11=', meaning: 'n°2 attaque V5, n°11 adverse contre faute' },
    { code: 'a07AV6.08D-', meaning: 'n°7 adverse attaque, n°8 (toi) défend (négatif)' },
    { code: '*12AX5.06+', meaning: 'n°12 rapide zone 4, n°6 adverse contre (touché)' },
    { code: 'a04AH2.10D#', meaning: 'n°4 adverse attaque, n°10 (toi) défend parfaitement' },
  ],
  eval: [
    { prompt: 'Le n°5 attaque V6, le n°12 adverse contre (point)', answer: '*05AV66.12#' },
    { prompt: 'Le n°5 attaque V6, le n°12 adverse défend parfaitement', answer: '*05AV66.12D#' },
    { prompt: 'Le n°9 extérieur attaque A Quick, le n°3 à domicile contre (point)', answer: 'a09AX1.03#' },
    { prompt: 'Le n°5 attaque frappée, le n°2 adverse défend (positif)', answer: '*05AH4.02D+' },
    { prompt: 'Le n°11 attaque haute zone 4, le n°6 adverse contre (positif)', answer: '*11AV5.06+' },
    { prompt: 'Le n°8 extérieur attaque pipe, le n°4 à domicile défend (parfait)', answer: 'a08AXP.04D#' },
    { prompt: 'Le n°6 attaque A Quick, le n°10 adverse contre (point)', answer: '*06AX1.10#' },
    { prompt: 'Le n°3 extérieur attaque haute zone 2, le n°7 à domicile défend (négatif)', answer: 'a03AV6.07D-' },
    { prompt: 'Le n°9 attaque rapide zone 4, le n°12 adverse contre (faute)', answer: '*09AX5.12=' },
    { prompt: 'Le n°5 attaque frappée, le n°3 adverse défend (parfait)', answer: '*05AH4.03D#' },
  ],
};

const L9 = {
  id: 'l9',
  title: 'Contre, défense, ballon libre',
  subtitle: 'Les autres compétences du jeu',
  color: '#3d9ea6',
  theory: [
    { title: 'Le contre (B)', text: 'Le contre est l’action de bloc au filet, face à l’attaque adverse. Il se code « B » avec une évaluation.', code: '*11B#', meaning: 'contre gagnant du n°11' },
    { title: 'La défense (D)', text: 'La défense est la récupération d’une balle attaquée, à l’arrière du terrain. Elle se code « D ».', code: 'a02D#', meaning: 'défense parfaite du n°2 adverse' },
    { title: 'Le ballon libre (F)', text: 'Le ballon libre est une balle renvoyée SANS attaque (manchette ou passe haute gratuite). Il se code « F ». Rappel : ce n’est PAS une faute.', code: '*03F-', meaning: 'ballon libre négatif du n°3' },
    { title: 'Les évaluations du contre', text: '« # » contre gagnant (stuff) · « + » touché (contre-attaque possible) · « ! » rejouable par l’adversaire · « / » faute de filet · « = » contre faute (balle dehors).', code: 'a05B+', meaning: 'contre touché du n°5 adverse' },
    { title: 'Les évaluations de la défense', text: '« # » défense parfaite · « + » bonne · « ! » OK · « − » attaque structurée impossible pour l’équipe · « / » balle renvoyée directement · « = » défense ratée.', code: '*06D=', meaning: 'défense ratée du n°6' },
    { title: 'À retenir', text: 'Contre (B) = au filet ; Défense (D) = à l’arrière ; Ballon libre (F) = renvoi sans attaque. Toutes ont une évaluation obligatoire.', code: 'a12B#', meaning: 'contre gagnant du n°12 adverse' },
  ],
  practice: [
    { code: '*09B=', meaning: 'contre faute du n°9' },
    { code: 'a07D+', meaning: 'défense positive du n°7 adverse' },
    { code: '*04F#', meaning: 'ballon libre parfait du n°4' },
    { code: 'a11D!', meaning: 'défense neutre du n°11 adverse' },
    { code: '*02B/', meaning: 'contre faute de filet du n°2' },
    { code: '*10D-', meaning: 'défense négative du n°10' },
    { code: 'a03F=', meaning: 'ballon libre raté du n°3 adverse' },
    { code: '*08B+', meaning: 'contre touché du n°8' },
    { code: 'a12D#', meaning: 'défense parfaite du n°12 adverse' },
    { code: '*05F-', meaning: 'ballon libre négatif du n°5' },
  ],
  eval: [
    { prompt: 'Contre gagnant du n°11', answer: '*11B#' },
    { prompt: 'Défense parfaite du n°2 extérieur', answer: 'a02D#' },
    { prompt: 'Ballon libre négatif du n°3', answer: '*03F-' },
    { prompt: 'Contre touché du n°5 extérieur', answer: 'a05B+' },
    { prompt: 'Défense ratée du n°6', answer: '*06D=' },
    { prompt: 'Contre faute du n°9', answer: '*09B=' },
    { prompt: 'Défense positive du n°10 extérieur', answer: 'a10D+' },
    { prompt: 'Ballon libre parfait du n°7', answer: '*07F#' },
    { prompt: 'Défense neutre du n°4', answer: '*04D!' },
    { prompt: 'Contre gagnant du n°12 extérieur', answer: 'a12B#' },
  ],
};

const L10 = {
  id: 'l10',
  title: 'Le rallye complet',
  subtitle: 'Enchaîner un point entier, d’un seul coup',
  color: '#8a6cc8',
  theory: [
    { title: 'On assemble tout', text: 'Un point (rallye) est une suite d’actions. On les tape les unes après les autres, séparées par un ESPACE : « *07R# *03E+ *09A45# ».', code: '*07R# *03E+ *09A45#', meaning: 'réception → passe → attaque' },
    { title: 'L’ordre d’un rallye', text: 'Side-out typique : S (service) → R (réception) → E (passe) → A (attaque) → B/D (contre/défense). Puis nouveau contact de l’autre équipe.', code: '*04S# a03R+ a06E+ a08A#', meaning: 'service → réception adverse → passe → attaque' },
    { title: 'Utilise les formules combinées !', text: 'Pour aller vite : service.réception et attaque.contre/défense tiennent en un code. Un point de 4 actions peut se coder en 2 frappes.', code: '12S.10+ a07E# a09A45#', meaning: 'serv/récep → passe → attaque' },
    { title: 'Changement d’équipe', text: 'Après le service, c’est l’équipe en RÉCEPTION qui enchaîne (R, E, A). Après une attaque, la réponse est l’équipe ADVERSE (B ou D).', code: '*04S# a03R# a06E+ a08A/ a05B#', meaning: 'point complet avec contre adverse' },
    { title: 'À retenir', text: 'Sépare les codes par un espace. C’est la compétence de match : enchaîner vite et sans erreur. C’est l’épreuve finale de la Formation !', code: 'a05S.11# *11E# *09A45#', meaning: 'service adverse, réception, passe, attaque' },
  ],
  practice: [
    { code: '*04S# a03R+ a06E+ a08A#', meaning: 'service, réception adverse, passe, attaque' },
    { code: 'a05S.11# *11E# *09A45#', meaning: 'service adverse (ace), réception, passe, attaque' },
    { code: '*07R# *02E+ *06AH3#', meaning: 'réception parfaite → passe → attaque frappée en zone 3' },
    { code: '*09AX1.03#', meaning: 'attaque A Quick contrée par le n°3 adverse' },
    { code: '*11AV5.06D+', meaning: 'attaque V5, le n°6 adverse défend (positif)' },
    { code: 'a04S.09# *09E+ *08AP45#', meaning: 'service adverse, réception, passe, attaque placée 4 → 5' },
    { code: '05AV66.12#', meaning: 'attaque V6, le n°12 adverse contre (point)' },
    { code: '*06S# a11R- a07E+ a09A/ a05B#', meaning: 'point complet : service, réception, passe, attaque contrée, contre' },
    { code: '*12S.10- *10E+ *04AV5#', meaning: 'serv/récep, passe, attaque haute en zone 4' },
    { code: 'a08S.02# *02E# *11AX1#', meaning: 'serv/récep, passe, A Quick du n°11' },
  ],
  eval: [
    { prompt: 'Ton n°12 sert, le n°10 adverse reçoit mal', answer: '12S.10-' },
    { prompt: 'Le n°4 de ton équipe fait un service gagnant', answer: '*04S#' },
    { prompt: 'Ton n°7 reçoit parfaitement, ton n°3 passe, ton n°9 attaque des zones 4 vers 5 (point)', answer: '*07R# *03E+ *09A45#' },
    { prompt: 'Ton n°5 attaque V6, le n°12 adverse contre (point)', answer: '05AV66.12#' },
    { prompt: 'Ton n°11 attaque haute zone 4, le n°6 adverse défend parfaitement', answer: '*11AV5.06D#' },
    { prompt: 'Le n°5 adverse sert, ton n°11 reçoit mal', answer: 'a05S.11-' },
    { prompt: 'Ton n°9 attaque A Quick, contrée par le n°3 adverse', answer: '*09AX1.03#' },
    { prompt: 'Ton n°8 reçoit mal, ton n°2 passe, ton n°6 attaque frappée depuis la zone 3', answer: '*08R- *02E+ *06AH3+' },
    { prompt: 'Ton n°4 attaque V5, le n°9 adverse défend (positif)', answer: '*04AV5.09D+' },
    { prompt: 'Ton n°6 sert, le n°12 adverse rate sa réception', answer: '06S.12=' },
  ],
};

const L11 = {
  id: 'l11',
  title: 'Le match en direct',
  subtitle: 'Points, temps morts, remplacements, rotations, appels',
  color: '#c05a5a',
  theory: [
    { title: 'Au-delà du rallye', text: 'Pendant un match, on code aussi des ÉVÉNEMENTS : on marque un point, on note un temps mort, un remplacement, un changement de rotation… avec des codes très courts.', code: 'P', meaning: 'point pour ton équipe' },
    { title: 'P / aP : le point', text: 'Quand le point est connu sans tout coder : « P » = point pour ton équipe, « aP » = point pour l’adversaire.', code: 'aP', meaning: 'point pour l’adversaire' },
    { title: 'T / aT : le temps mort', text: '« T » = temps mort pour ton équipe, « aT » = temps mort pour l’adversaire. Une seule lettre !', code: 'T', meaning: 'temps mort (ton équipe)' },
    { title: 'C1:2 : le remplacement', text: '« C », puis le n° qui SORT, « : », puis le n° qui ENTRE. Ex. : « C5:12 » = le n°5 sort, le n°12 entre (ton équipe). « aC3:9 » = côté adverse.', code: 'C5:12', meaning: 'le n°5 sort, le n°12 entre' },
    { title: 'Z1 / I1 : la rotation', text: '« Z1 » place le passeur en zone 1 (nouveau tour de service). « I1 » change l’équipe de côté / rotation. Une lettre + un chiffre.', code: 'Z1', meaning: 'passeur en zone 1 (ton équipe)' },
    { title: 'Les appels passeur (K)', text: 'Le passeur ANNONCE la combinaison avec un appel « K » : K1, K2, … K9, KM, KP. On l’écrit juste après la passe « E ».', code: '*07EK1#', meaning: 'passe du n°7 avec l’appel K1' },
    { title: 'À retenir', text: 'Les événements (P, T, C, Z, I) se tapent d’une à trois touches : c’est le grand confort du direct. Les appels K complètent la passe.', code: 'a10EKP+', meaning: 'passe du n°10 adverse, appel KP' },
  ],
  practice: [
    { code: 'P', meaning: 'point pour ton équipe' },
    { code: 'aP', meaning: 'point pour l’adversaire' },
    { code: 'aT', meaning: 'temps mort pour l’adversaire' },
    { code: 'aC3:9', meaning: 'remplacement adverse : n°3 sort, n°9 entre' },
    { code: 'Z6', meaning: 'rotation : passeur en zone 6 (ton équipe)' },
    { code: 'I2', meaning: 'changement de côté / rotation (I2)' },
    { code: '*05EK2+', meaning: 'passe du n°5, appel K2' },
    { code: 'a09EK5#', meaning: 'passe du n°9 adverse, appel K5' },
    { code: '*07EKM+', meaning: 'passe du n°7, appel KM' },
    { code: 'a11EKP#', meaning: 'passe du n°11 adverse, appel KP' },
  ],
  eval: [
    { prompt: 'Point direct pour ton équipe', answer: 'P' },
    { prompt: 'Point direct pour l’adversaire', answer: 'aP' },
    { prompt: 'Temps mort pour ton équipe', answer: 'T' },
    { prompt: 'Temps mort pour l’adversaire', answer: 'aT' },
    { prompt: 'Remplacement (ton équipe) : le n°5 sort, le n°12 entre', answer: 'C5:12' },
    { prompt: 'Remplacement (adverse) : le n°3 sort, le n°9 entre', answer: 'aC3:9' },
    { prompt: 'Changement de rotation (ton équipe), passeur en zone 1', answer: 'Z1' },
    { prompt: 'Passe du n°7 avec l’appel K1', answer: '*07EK1#' },
    { prompt: 'Passe du n°10 adverse avec l’appel KP', answer: 'a10EKP+' },
    { prompt: 'Passe du n°7 avec l’appel K2', answer: '*07EK2#' },
  ],
};

export const LESSONS = [L1, L2, L3, L4, L5, L6, L7, L8, L9, L10, L11];

export const LESSON_IDS = LESSONS.map((l) => l.id);

export function findLesson(id) {
  return LESSONS.find((l) => l.id === id) || null;
}

/** Normalise une réponse de leçon : codes canoniques (gère les suites et le `*`). */
export function normalizeLessonAnswer(input) {
  const items = parseSequence(input || '');
  return items
    .map((x) => x.code)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Valide une réponse de leçon. Comparaison par le parseur (codes, suites) puis,
 * en repli, comparaison textuelle (pour les codes manuels P/T/C/Z/I non gérés
 * par le parseur).
 */
export function checkLessonAnswer(input, answer) {
  const norm = normalizeLessonAnswer(input);
  const want = normalizeLessonAnswer(answer);
  if (norm && norm === want) return true;
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
  return clean(input) === clean(answer);
}

/**
 * Génère une « leçon de rappel » : mélange de notions issues des leçons déjà
 * validées (diapos + évaluation mixte). Se régénère à chaque appel.
 * @param {string[]} completedIds - ids des leçons terminées
 * @param {number} slideCount - nb de diapos à générer
 * @param {number} evalCount - nb de questions à générer
 */
export function generateRecall(completedIds, slideCount = 5, evalCount = 10) {
  const done = LESSONS.filter((l) => completedIds.includes(l.id));
  if (done.length === 0) return null;
  const shuffle = (a) => {
    const x = a.slice();
    for (let i = x.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
    }
    return x;
  };
  // Diapos : pool de toutes les diapos des leçons validées, mélangées.
  const slidePool = [];
  for (const l of done) {
    for (const t of l.theory) slidePool.push({ ...t, from: l.title });
  }
  const slides = shuffle(slidePool).slice(0, slideCount);
  // Évaluation : questions tirées au hasard dans les leçons validées.
  const pool = [];
  for (const l of done) {
    for (const item of l.eval) pool.push({ ...item, from: l.title });
  }
  const questions = shuffle(pool).slice(0, evalCount);
  return {
    id: 'recall',
    title: 'Leçon de rappel',
    subtitle: 'Révision mélangée des leçons validées',
    color: '#c8965c',
    recall: true,
    theory: slides,
    practice: [],
    eval: questions,
  };
}
