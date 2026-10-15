; ============================================================================
; Script NSIS personnalisé — installeur ASUL
;
; AUCUNE action personnalisée n'est nécessaire :
;   • la règle de pare-feu du match en direct n'est plus créée ici, mais par
;     l'application au premier besoin (menu « Serveur → Autoriser le match en
;     direct dans le pare-feu… ») — l'installeur n'exécute donc plus netsh
;     avec élévation, ce qui faisait bloquer l'installation par les antivirus
;     et par SmartScreen ;
;   • l'installation est par utilisateur (%LOCALAPPDATA%\Programs\ASUL) :
;     aucun droit administrateur n'est demandé.
;
; Les deux macros restent déclarées (vides) : electron-builder les insère dans
; son propre script. Voir electron-builder.yml et README section 10.
; ============================================================================

!macro customInstall
!macroend

!macro customUnInstall
!macroend
