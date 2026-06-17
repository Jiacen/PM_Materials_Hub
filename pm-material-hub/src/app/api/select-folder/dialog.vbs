Set objShell = CreateObject("Shell.Application")
Set objFolder = objShell.BrowseForFolder(0, "Select PM Materials Root Folder", 0, 0)
If Not objFolder Is Nothing Then
    WScript.Echo objFolder.Self.Path
End If
