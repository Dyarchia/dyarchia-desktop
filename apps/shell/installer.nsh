/*
 * The application installs for one user and nowhere else. An assisted installer with
 * perMachine false opens on a page asking who it is for, and the machine-wide answer puts the
 * application in Program Files: a directory it cannot write to, under a key it needed
 * elevation to make, for an application that has nothing to share between accounts. This
 * macro is read by the install mode page before it draws anything, so the page never appears
 * and the installer never asks for elevation. The directory page still follows, so the
 * location remains the user's to change.
 */
!macro customInstallMode
    StrCpy $isForceCurrentInstall "1"
!macroend
