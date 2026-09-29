/*
 * The program installs where electron-builder puts a per-user NSIS installer when nobody says
 * otherwise, %LOCALAPPDATA%\Programs\dyarchia, and the state and data live apart from it in
 * %APPDATA%\dyarchia, which the uninstaller never touches.
 *
 * Versions up to 0.4.x installed into ~/.dyarchia\app and wrote that as the HKCU InstallLocation,
 * which an update reads as its default directory. So a location pointing there is cleared, in both
 * registry views, and the update lands in the default; the application moves the rest of
 * ~/.dyarchia on its first launch. A location anywhere else is the user's own choice and is kept.
 */
!macro dyarchiaForgetOldLocation
    ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $0 == "$PROFILE\.dyarchia\app"
        DeleteRegValue HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${EndIf}
!macroend

!macro preInit
    SetRegView 64
    !insertmacro dyarchiaForgetOldLocation
    SetRegView 32
    !insertmacro dyarchiaForgetOldLocation
!macroend

/*
 * An assisted installer with perMachine false does not install per user: it opens on a page
 * asking who the application is for, and the machine-wide answer elevates and installs into
 * Program Files, a directory the application cannot write to. This macro is read by that page
 * before it draws anything, so the page never appears and elevation is never requested. The
 * directory page still follows, so the location remains the user's to change.
 */
!macro customInstallMode
    StrCpy $isForceCurrentInstall "1"
!macroend
