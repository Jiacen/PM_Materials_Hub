Add-Type -AssemblyName System.windows.forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = "Select PM Materials Root Folder"
$f.ShowNewFolderButton = $true
if ($f.ShowDialog() -eq 'OK') {
    Write-Host $f.SelectedPath
}
