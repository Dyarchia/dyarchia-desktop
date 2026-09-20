/*
 * One root. Everything this application is or keeps lives under ~/.dyarchia: the program in
 * app/, what the plugins make in data/, the state at the top. Nothing of it is in
 * %LOCALAPPDATA%\Programs, which is where an NSIS installer goes when nobody tells it
 * otherwise, and nothing of it is anywhere a second account could reach.
 *
 * The program is one directory down rather than at the root because the uninstaller ends with
 * `RMDir /r $INSTDIR` and an update renames everything under it: pointing either at ~/.dyarchia
 * itself would put the boards, the corpus and the layout inside the blast radius of
 * uninstalling. app/ is the part that is safe to delete, and deleting it is exactly what
 * uninstalling should mean.
 */
!define DYARCHIA_HOME "$PROFILE\.dyarchia\app"

/*
 * The default install directory is read out of the registry before the installer decides
 * anything, so writing it there is how it is set. HKCU only: HKLM needs elevation, and a key
 * under it is what makes the installer offer to install for everyone.
 */
!macro preInit
    SetRegView 64
    WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "${DYARCHIA_HOME}"
    SetRegView 32
    WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "${DYARCHIA_HOME}"
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
